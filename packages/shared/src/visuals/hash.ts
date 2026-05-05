// ---------------------------------------------------------------------------
// Deterministic prompt hashing for visual assets cache.
//
// The hash MUST include every input that influences the visual output so that
// cache hits are correct (no cross-template / cross-language collisions).
// Uses Web Crypto so the function works in Node 20+ AND in Edge runtime
// (matches the pattern used in `viral/engine/hashing.ts`).
// ---------------------------------------------------------------------------

import type { AssetProvider } from './types.js';

interface WebCryptoSubtle {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
}
interface WebCryptoLike {
  subtle: WebCryptoSubtle;
}

function getSubtle(): WebCryptoSubtle {
  const g = globalThis as unknown as { crypto?: WebCryptoLike };
  if (!g.crypto?.subtle) {
    throw new Error('Web Crypto API (globalThis.crypto.subtle) is not available in this runtime.');
  }
  return g.crypto.subtle;
}

interface TextEncoderLike {
  encode(input: string): Uint8Array;
}
declare const TextEncoder: new () => TextEncoderLike;

export interface PromptHashInput {
  prompt: string;
  themeColor: string;
  provider: AssetProvider;
  template: string;
  language: string;
}

/**
 * Compute a deterministic 32-char hex SHA-256 hash for a visual prompt.
 *
 * The canonical form normalises:
 *  - prompt: trimmed
 *  - themeColor: lowercased
 *  - provider / template / language: as-is
 *
 * Returns first 32 hex chars (128 bits — collision-resistant for our scale).
 */
export async function computePromptHash(input: PromptHashInput): Promise<string> {
  const canonical = JSON.stringify({
    p: input.prompt.trim(),
    c: input.themeColor.toLowerCase(),
    pr: input.provider,
    t: input.template,
    l: input.language,
  });
  const data = new TextEncoder().encode(canonical);
  const buf = await getSubtle().digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}
