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

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.APIError && error.status >= 500) return true;
  return false;
}

export async function callClaude(opts: CallClaudeOptions): Promise<CallClaudeResult> {
  const client = getClient();
  const model = resolveModelId(opts.model);
  const maxTokens = opts.maxTokens ?? 4096;

  const systemBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: opts.system,
    cache_control: { type: 'ephemeral' },
  };

  let tools: Anthropic.Tool[] | undefined;
  if (opts.tools && opts.tools.length > 0) {
    tools = opts.tools.map((t, i) => {
      if (i === opts.tools!.length - 1) {
        return { ...t, cache_control: { type: 'ephemeral' } } as Anthropic.Tool;
      }
      return t;
    });
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS[attempt - 1]!);
    }

    try {
      const startMs = Date.now();

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [systemBlock],
        messages: opts.messages,
        ...(tools ? { tools, tool_choice: { type: 'any' } } : {}),
      });

      const durationMs = Date.now() - startMs;
      const usage = response.usage as Anthropic.Usage & {
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };

      const meta: CallMeta = {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheCreation: usage.cache_creation_input_tokens ?? 0,
        durationMs,
      };

      console.log(
        `[claude] model=${model} in=${meta.inputTokens} out=${meta.outputTokens} ` +
          `cacheRead=${meta.cacheRead} cacheCreate=${meta.cacheCreation} dur=${meta.durationMs}ms`,
      );

      const toolUseBlock = response.content.find((b) => b.type === 'tool_use') as
        | Anthropic.ToolUseBlock
        | undefined;

      if (toolUseBlock) {
        return { toolInput: toolUseBlock.input, meta };
      }

      const textBlock = response.content.find((b) => b.type === 'text') as
        | Anthropic.TextBlock
        | undefined;

      return { text: textBlock?.text ?? '', meta };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt >= MAX_RETRIES - 1) {
        throw error;
      }
      console.warn(`[claude] attempt ${attempt + 1} failed, retrying...`, error);
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
