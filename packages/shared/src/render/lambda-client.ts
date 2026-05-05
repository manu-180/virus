import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { videoInputSchema } from './types.js';
import type { RenderOptions, StartRenderResult, RenderProgressResult } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAMBDA_PRICE_PER_GB_SEC = 0.0000166667; // USD, us-east-1 (2024)
const RENDER_MEMORY_GB = 2; // Remotion default: 2048 MB

const COMPOSITION_MAP: Record<string, string> = {
  tip: 'tip',
  'hot-take': 'hot-take',
  'speed-build': 'speed-build',
  listicle: 'listicle',
  story: 'story',
  comparison: 'comparison',
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getRegion(): string {
  return process.env['REMOTION_REGION'] ?? 'us-east-1';
}

function parseS3Url(url: string): { bucket: string; key: string } {
  // virtual-hosted: https://{bucket}.s3[.{region}].amazonaws.com/{key}
  const vhost = url.match(/^https:\/\/([^.]+)\.s3[^.]*\.amazonaws\.com\/(.+)$/);
  if (vhost) return { bucket: vhost[1]!, key: vhost[2]! };
  // path-style: https://s3[.{region}].amazonaws.com/{bucket}/{key}
  const path = url.match(/^https:\/\/s3[^.]*\.amazonaws\.com\/([^/]+)\/(.+)$/);
  if (path) return { bucket: path[1]!, key: path[2]! };
  throw new Error(`Cannot parse S3 URL: ${url}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function estimateRenderCost(durationSec: number): number {
  return durationSec * RENDER_MEMORY_GB * LAMBDA_PRICE_PER_GB_SEC;
}

/**
 * Validates inputProps and starts an async Remotion Lambda render.
 * Validates against videoInputSchema before invoking Lambda to avoid wasted spend.
 *
 * Required env vars: REMOTION_LAMBDA_FUNCTION_NAME, REMOTION_SERVE_URL
 * Optional: REMOTION_REGION (default: us-east-1)
 */
export async function startRender(opts: RenderOptions): Promise<StartRenderResult> {
  const parsed = videoInputSchema.safeParse(opts.inputProps);
  if (!parsed.success) {
    throw new Error(`Invalid inputProps — aborting before Lambda invocation:\n${parsed.error.message}`);
  }

  const functionName = requireEnv('REMOTION_LAMBDA_FUNCTION_NAME');
  const serveUrl = requireEnv('REMOTION_SERVE_URL');
  const region = getRegion();

  const compositionId = COMPOSITION_MAP[opts.composition];
  if (!compositionId) throw new Error(`Unknown composition: ${opts.composition}`);

  console.log(`[render] starting composition=${opts.composition} (${compositionId})`);
  const startedAt = Date.now();

  const result = await renderMediaOnLambda({
    region: region as Parameters<typeof renderMediaOnLambda>[0]['region'],
    functionName,
    serveUrl,
    composition: compositionId,
    inputProps: parsed.data,
    codec: 'h264',
    imageFormat: 'jpeg',
    crf: 18,
    audioBitrate: '192k',
    pixelFormat: 'yuv420p',
    maxRetries: 1,
    privacy: 'private',
    timeoutInMilliseconds: 300_000,
    framesPerLambda: 200, // ~7 chunk Lambdas + 1 main = 8 total; fits in 10-concurrency account limit
    ...(opts.outName ? { outName: opts.outName } : {}),
  });

  console.log(
    `[render] job created renderId=${result.renderId} bucketName=${result.bucketName} elapsed=${Date.now() - startedAt}ms`,
  );

  return { renderId: result.renderId, bucketName: result.bucketName };
}

/**
 * Fetches the current render progress. Call on a polling interval (e.g. every 5 s)
 * until done=true or errors is set.
 */
export async function pollRender(input: {
  renderId: string;
  bucketName: string;
}): Promise<RenderProgressResult> {
  const functionName = requireEnv('REMOTION_LAMBDA_FUNCTION_NAME');
  const region = getRegion();

  const progress = await getRenderProgress({
    renderId: input.renderId,
    bucketName: input.bucketName,
    functionName,
    region: region as Parameters<typeof getRenderProgress>[0]['region'],
  });

  if (progress.fatalErrorEncountered) {
    const errors = progress.errors.map((e) => e.message);
    return {
      done: false,
      errors: errors.length ? errors : ['render_failed'],
      overallProgress: progress.overallProgress,
    };
  }

  if (progress.done) {
    const billingMs = progress.estimatedBillingDurationInMilliseconds ?? 0;
    const durationSec = billingMs / 1000;
    const costUSD = estimateRenderCost(durationSec);
    const sizeMB = ((progress.outputSizeInBytes ?? 0) / 1_048_576).toFixed(2);

    console.log(
      `[render] done renderId=${input.renderId} billingDurationSec=${durationSec.toFixed(1)} ` +
        `estimatedCostUSD=${costUSD.toFixed(6)} outputSizeMB=${sizeMB}`,
    );

    if (progress.outputFile) {
      return { done: true, outputFile: progress.outputFile, overallProgress: 1 };
    }
    return { done: true, overallProgress: 1 };
  }

  return { done: false, overallProgress: progress.overallProgress };
}

/**
 * Downloads a completed render from S3 to a local path.
 * Calls pollRender once to resolve the output file URL, then streams it to disk.
 */
export async function downloadRender(input: {
  renderId: string;
  bucketName: string;
  localPath: string;
}): Promise<void> {
  const s3 = new S3Client({ region: getRegion() });

  const progress = await pollRender({ renderId: input.renderId, bucketName: input.bucketName });
  if (!progress.outputFile) {
    throw new Error(`Render ${input.renderId} has no output file — is it done?`);
  }

  const { bucket, key } = parseS3Url(progress.outputFile);

  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const sizeBytes = head.ContentLength ?? 0;

  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!Body) throw new Error('Empty S3 response body');

  await pipeline(Body as unknown as Readable, createWriteStream(input.localPath));

  console.log(
    `[render] downloaded renderId=${input.renderId} path=${input.localPath} sizeMB=${(sizeBytes / 1_048_576).toFixed(2)}`,
  );
}
