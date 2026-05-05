/**
 * generate-video-project-aware — Inngest function triggered by virus/generate.requested.
 *
 * MIGRATION NOTE: This function listens to 'virus/generate.requested' (project-aware).
 * The legacy per-step functions (generate-script, synthesize-audio, etc.) listen to their
 * own events and remain unchanged. This orchestrator runs the full pipeline in one function.
 *
 * Event payload: { videoId: string; projectId: string; userId: string }
 *
 * Steps:
 *  1. load-context      — load project, patterns, brand, recent signatures from DB
 *  2. suggest           — pick hook + topic + format (anti-repeat applied)
 *  3. script            — write script via Claude (writeScript)
 *  4. audio             — STUB: placeholder (ElevenLabs integration pending T5-P02)
 *  5. captions          — STUB: placeholder (transcription pending T5-P02)
 *  6. render            — STUB: placeholder (Lambda render pending T5-P02)
 *  7. persist-signature — write hashes to project_used_signatures (UPSERT)
 *  8. complete          — set video status 'ready', log job event
 *
 * Failure: onFailure sets video to 'failed' and logs the error.
 * Idempotency: persistSignature uses UPSERT on video_id.
 * Cost tracking: logJobEvent includes token/char counts per step.
 */

import { NonRetriableError } from 'inngest';
import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { setVideoStatus, logJobEvent } from '../utils/index.js';
import { writeScript } from '@virus/shared/ai';
import type { ProjectPatterns, ProjectBrand } from '@virus/shared/viral';
import { engine as viralEngine } from '@virus/shared/viral';
const { suggest } = viralEngine;
import { getRecentSignatures } from './anti-repeat-query.js';
import type { RecentSignature } from './anti-repeat-query.js';
import { persistSignature } from './anti-repeat-persist.js';

// ---------------------------------------------------------------------------
// Types for DB rows
// ---------------------------------------------------------------------------

interface ProjectPatternsRow {
  hooks: unknown;
  formats: unknown;
  pacing: unknown;
  visual_elements: unknown;
  cta_templates: unknown;
  hashtags: unknown;
}

interface ProjectBrandRow {
  brand_name: unknown;
  one_liner: unknown;
  voice_tone: unknown;
  ctas: unknown;
  do_not_say: unknown;
  audience: unknown;
}

interface ProjectRow {
  id: string;
  user_id: string;
  theme_color: string | null;
  language: string | null;
  voice_clone_id: string | null;
}

// ---------------------------------------------------------------------------
// Helper: reconstruct domain objects from flat DB columns
// (Same pattern as generate-script.ts — kept local to avoid server-only imports)
// ---------------------------------------------------------------------------

function buildPatterns(projectId: string, row: ProjectPatternsRow): ProjectPatterns {
  return {
    projectId,
    hooks: (row.hooks as ProjectPatterns['hooks']) ?? [],
    formats: (row.formats as ProjectPatterns['formats']) ?? [],
    topics: [],
    pacing: (row.pacing as ProjectPatterns['pacing']) ?? {
      audioSpeedMultiplier: { min: 1.1, max: 1.3 },
      cutEverySec: { min: 2, max: 4 },
      ideaDensitySec: 2,
      musicBpm: { min: 80, max: 140 },
      voiceLufs: -16,
      musicLufs: -30,
      duckingDb: -12,
    },
    visualElements: (row.visual_elements as ProjectPatterns['visualElements']) ?? [],
    ctaTemplates: (row.cta_templates as string[]) ?? [],
    hashtags: (row.hashtags as ProjectPatterns['hashtags']) ?? {
      reels: [],
      tiktok: [],
      shorts: [],
    },
    captionTemplates: {} as ProjectPatterns['captionTemplates'],
    language: 'es',
    parsedAt: new Date().toISOString(),
  };
}

function buildBrand(projectId: string, row: ProjectBrandRow): ProjectBrand {
  return {
    projectId,
    brandName: (row.brand_name as string) ?? '',
    oneLiner: (row.one_liner as string) ?? '',
    voiceTone: (row.voice_tone as string) ?? 'conversacional',
    ctas: (row.ctas as ProjectBrand['ctas']) ?? [],
    doNotSay: (row.do_not_say as string[]) ?? [],
    audience: (row.audience as ProjectBrand['audience']) ?? {
      who: '',
      where: '',
      pains: [],
    },
    valueProps: [],
    features: [],
    caseStudies: [],
    parsedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Local context loader
// (Cannot import from apps/web/ — server-only boundary; replicate the logic here)
// ---------------------------------------------------------------------------

interface GenerationContext {
  project: ProjectRow;
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  recentSignatures: RecentSignature[];
  voiceCloneId: string | null;
}

async function loadGenerationContextForWorker(projectId: string): Promise<GenerationContext> {
  const db = getAdminClient();

  // Load all four data sources in parallel
  const [patternsResult, brandResult, signaturesResult, profileResult] = await Promise.all([
    db
      .from('project_patterns')
      .select('hooks, formats, pacing, visual_elements, cta_templates, hashtags')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .single(),

    db
      .from('project_brand')
      .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .single(),

    getRecentSignatures({ projectId, windowDays: 14 }),

    db
      .from('projects')
      .select('id, user_id, theme_color, language, voice_clone_id')
      .eq('id', projectId)
      .single(),
  ]);

  // Validate required rows — throw immediately so the step fails cleanly
  if (patternsResult.error || !patternsResult.data) {
    throw new Error(
      `patterns_not_found:${projectId} — ${patternsResult.error?.message ?? 'no data'}`,
    );
  }

  if (brandResult.error || !brandResult.data) {
    throw new Error(
      `brand_not_found:${projectId} — ${brandResult.error?.message ?? 'no data'}`,
    );
  }

  if (profileResult.error || !profileResult.data) {
    throw new Error(
      `project_not_found:${projectId} — ${profileResult.error?.message ?? 'no data'}`,
    );
  }

  const project = profileResult.data as ProjectRow;
  const patterns = buildPatterns(projectId, patternsResult.data as ProjectPatternsRow);
  const brand = buildBrand(projectId, brandResult.data as ProjectBrandRow);

  // getRecentSignatures throws internally on DB error — propagate as-is
  const recentSignatures = signaturesResult;

  return {
    project,
    patterns,
    brand,
    recentSignatures,
    voiceCloneId: project.voice_clone_id,
  };
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const generateVideoProjectAware = inngest.createFunction(
  {
    id: 'generate-video-project-aware',
    retries: 2,
    concurrency: { limit: 3, key: 'event.data.userId' },
    onFailure: async ({ event, error }) => {
      // Inngest wraps the original event in event.data.event when invoking
      // onFailure — same pattern as generate-script.ts.
      const original = (
        event as unknown as {
          data: { event: { data: { videoId?: string; projectId?: string; userId?: string } } };
        }
      ).data.event;

      const videoId = original?.data?.videoId;
      const projectId = original?.data?.projectId;
      const userId = original?.data?.userId;

      console.log({
        fn: 'generate-video-project-aware',
        step: 'onFailure',
        videoId,
        projectId,
        userId,
        error: error?.message,
      });

      if (!videoId) return;

      const db = getAdminClient();

      try {
        await setVideoStatus(videoId, 'failed', { error: error?.message ?? 'unknown_error' });
      } catch (setErr) {
        console.error('[generate-video-project-aware] onFailure setVideoStatus failed', setErr);
      }

      // Fire-and-forget audit for the failure
      try {
        await db.from('job_events').insert({
          video_id: videoId,
          step: 'generate-video-project-aware',
          status: 'failed',
          payload: { error: error?.message ?? 'unknown_error' },
        });
      } catch (auditErr) {
        console.error(
          '[generate-video-project-aware] onFailure job_events insert failed',
          auditErr,
        );
      }
    },
  },
  { event: 'virus/generate.requested' },
  async ({ event, step }) => {
    const { videoId, projectId, userId } = event.data as {
      videoId: string;
      projectId: string;
      userId: string;
    };

    console.log({ fn: 'generate-video-project-aware', step: 'start', videoId, projectId, userId });

    // ------------------------------------------------------------------
    // Step 1: load-context
    // ------------------------------------------------------------------
    const ctx = await step.run('load-context', () =>
      loadGenerationContextForWorker(projectId),
    );

    console.log({
      fn: 'generate-video-project-aware',
      step: 'load-context',
      videoId,
      projectId,
      signaturesCount: ctx.recentSignatures.length,
    });

    await setVideoStatus(videoId, 'scripting');

    // ------------------------------------------------------------------
    // Step 2: suggest — pick hook + topic + format (anti-repeat applied)
    // ------------------------------------------------------------------
    const suggestion = await step.run('suggest', async () => {
      try {
        const result = await suggest({
          patterns: ctx.patterns,
          brand: ctx.brand,
          recentSignatures: ctx.recentSignatures,
          windowDays: 14,
        });

        console.log({
          fn: 'generate-video-project-aware',
          step: 'suggest',
          videoId,
          hook: result.hook.text,
          topic: result.topic.name,
          format: result.format.id,
          hookHash: result.signature.hookHash,
        });

        return result;
      } catch (err) {
        const suggestErr = err as { code?: string; message?: string };
        if (suggestErr?.code === 'no_candidates') {
          await setVideoStatus(videoId, 'failed', {
            error: `no_candidates: ${suggestErr.message ?? 'all suggestions filtered by anti-repeat'}`,
          });
          // NonRetriableError tells Inngest to skip all remaining retries immediately.
          throw new NonRetriableError(
            `suggest_no_candidates:${projectId} — ${suggestErr.message ?? 'all hooks/topics exhausted in window'}`,
          );
        }
        throw err;
      }
    });

    // ------------------------------------------------------------------
    // Step 3: script — write script via Claude
    // ------------------------------------------------------------------
    const script = await step.run('script', () => {
      console.log({
        fn: 'generate-video-project-aware',
        step: 'script',
        videoId,
        format: suggestion.format.id,
        estimatedDurationSec: suggestion.format.optimalDurationSec.min,
      });

      return writeScript({
        hook: suggestion.hook.text,
        angle: suggestion.topic.name,
        format: suggestion.format.id as Parameters<typeof writeScript>[0]['format'],
        estimatedDurationSec: suggestion.format.optimalDurationSec.min,
        patterns: ctx.patterns,
        brand: ctx.brand,
      });
    });

    await setVideoStatus(videoId, 'audio', {
      script,
      theme_color: ctx.project.theme_color,
    });

    await logJobEvent(videoId, 'script', 'completed', {
      totalDurationSec: script.totalDurationSec,
    });

    console.log({
      fn: 'generate-video-project-aware',
      step: 'script',
      videoId,
      totalDurationSec: script.totalDurationSec,
      segments: script.segments.length,
    });

    // ------------------------------------------------------------------
    // Step 4: audio — STUB (ElevenLabs integration pending T5-P02)
    // ------------------------------------------------------------------
    await step.run('audio', async () => {
      // TODO: ElevenLabs synthesis — pending T5-P02 audio integration
      console.log({ fn: 'generate-video-project-aware', step: 'audio', videoId, note: 'stub' });
    });

    await setVideoStatus(videoId, 'captions');

    // ------------------------------------------------------------------
    // Step 5: captions — STUB (transcription pending T5-P02)
    // ------------------------------------------------------------------
    await step.run('captions', async () => {
      // TODO: transcription/captions — pending T5-P02 integration
      console.log({
        fn: 'generate-video-project-aware',
        step: 'captions',
        videoId,
        note: 'stub',
      });
    });

    await setVideoStatus(videoId, 'rendering');

    // ------------------------------------------------------------------
    // Step 6: render — STUB (Lambda render pending T5-P02)
    // ------------------------------------------------------------------
    await step.run('render', async () => {
      // TODO: Lambda render — pending T5-P02 integration
      console.log({ fn: 'generate-video-project-aware', step: 'render', videoId, note: 'stub' });
    });

    // ------------------------------------------------------------------
    // Step 7: persist-signature (UPSERT — idempotent on video_id)
    // ------------------------------------------------------------------
    await step.run('persist-signature', () =>
      persistSignature({
        projectId,
        videoId,
        hookHash: suggestion.signature.hookHash,
        topicHash: suggestion.signature.topicHash,
        angleHash: suggestion.signature.angleHash,
        hookText: suggestion.hook.text,
        topicName: suggestion.topic.name,
        format: suggestion.format.id,
      }),
    );

    console.log({
      fn: 'generate-video-project-aware',
      step: 'persist-signature',
      videoId,
      hookHash: suggestion.signature.hookHash,
    });

    // ------------------------------------------------------------------
    // Step 8: complete
    // ------------------------------------------------------------------
    await setVideoStatus(videoId, 'ready');

    await logJobEvent(videoId, 'generate-video-project-aware', 'completed', {
      projectId,
      hookHash: suggestion.signature.hookHash,
    });

    console.log({ fn: 'generate-video-project-aware', step: 'done', videoId, projectId });

    return { ok: true, videoId };
  },
);
