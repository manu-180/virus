import * as https from 'node:https';

import Anthropic from '@anthropic-ai/sdk';
import { resolveModelId, type ModelId } from './models.js';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
    });
  }
  return _client;
}

export interface CallClaudeOptions {
  model: ModelId;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
}

export interface CallMeta {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation: number;
  durationMs: number;
}

export interface CallClaudeResult {
  text?: string;
  toolInput?: unknown;
  meta: CallMeta;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Connection-level failure (the HTTP request never completed): undici
 * "Premature close", ECONNRESET, socket hang up, "fetch failed", etc. These are
 * NOT Anthropic.APIError (no status code) so they slipped through the old
 * isRetryable and killed callers with retries:0 (vidriera 2026-06-21). They are
 * safe to retry because no response was produced.
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  return /premature close|econnreset|socket hang up|fetch failed|terminated|und_err|other side closed|enotfound|eai_again|timeout|timed out/.test(
    msg,
  );
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string; input?: unknown }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  error?: { type?: string; message?: string };
}

/**
 * POST to the Anthropic Messages API over Node's native https stack (NOT undici /
 * global fetch). The SDK's undici client returned a persistent "Premature close"
 * from the Railway worker on 2026-06-21 while plain curl/native-https to the same
 * endpoint + key + model worked — so we mirror curl and sidestep undici. `agent:
 * false` + `connection: close` use a fresh, non-pooled connection per request.
 * Rejects on transport failure (caught + retried by callClaude).
 */
function anthropicMessagesRequest(
  body: Record<string, unknown>,
  apiKey: string,
  timeoutMs = 60_000,
): Promise<{ status: number; json: AnthropicResponse }> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        agent: false,
        timeout: timeoutMs,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'content-length': payload.length,
          connection: 'close',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: AnthropicResponse;
          try {
            json = text ? (JSON.parse(text) as AnthropicResponse) : {};
          } catch {
            json = { error: { message: `non-JSON body: ${text.slice(0, 200)}` } };
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('anthropic request timeout')));
    req.write(payload);
    req.end();
  });
}

export async function callClaude(opts: CallClaudeOptions): Promise<CallClaudeResult> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing from worker env');
  const model = resolveModelId(opts.model);
  const maxTokens = opts.maxTokens ?? 4096;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: opts.system,
    messages: opts.messages,
    ...(opts.tools && opts.tools.length > 0
      ? { tools: opts.tools, tool_choice: { type: 'any' as const } }
      : {}),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS[attempt - 1]!);
    }

    try {
      const startMs = Date.now();
      const { status, json } = await anthropicMessagesRequest(body, apiKey);

      if (status < 200 || status >= 300) {
        const detail = json.error?.message ?? `HTTP ${status}`;
        // 429 / 5xx → throw into the retry path; other 4xx are terminal.
        throw new Error(`anthropic HTTP ${status}: ${detail}`);
      }

      const durationMs = Date.now() - startMs;
      const usage = json.usage ?? {};
      const meta: CallMeta = {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheCreation: usage.cache_creation_input_tokens ?? 0,
        durationMs,
      };

      console.log(`[claude] model=${model} in=${meta.inputTokens} out=${meta.outputTokens} dur=${meta.durationMs}ms`);

      const content = json.content ?? [];
      const toolUseBlock = content.find((b) => b.type === 'tool_use');
      if (toolUseBlock) {
        return { toolInput: toolUseBlock.input, meta };
      }
      const textBlock = content.find((b) => b.type === 'text');
      return { text: textBlock?.text ?? '', meta };
    } catch (error) {
      lastError = error;
      const retryable =
        isConnectionError(error) || (error instanceof Error && /HTTP (429|5\d\d)/.test(error.message));
      if (!retryable || attempt >= MAX_RETRIES - 1) {
        throw error;
      }
      console.warn(`[claude] attempt ${attempt + 1} failed, retrying...`, error instanceof Error ? error.message : error);
    }
  }

  throw lastError;
}

export interface StreamClaudeOptions {
  model: ModelId;
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  onChunk?: (text: string) => void;
}

export async function streamClaude(opts: StreamClaudeOptions): Promise<string> {
  const client = getClient();
  const model = resolveModelId(opts.model);
  const maxTokens = opts.maxTokens ?? 4096;

  const systemBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: opts.system,
    cache_control: { type: 'ephemeral' },
  };

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: [systemBlock],
    messages: opts.messages,
  });

  let fullText = '';
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      fullText += event.delta.text;
      opts.onChunk?.(event.delta.text);
    }
  }

  return fullText;
}
