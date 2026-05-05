// Type-safe access to Web Crypto — available in Node 20+ and Edge runtimes.
// We cast through unknown to avoid requiring DOM lib types in the tsconfig.
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

/**
 * Compute a deterministic 16-char hex hash of the input string.
 * Uses SHA-256 via Web Crypto API (works in Node 20+ and Edge runtime).
 */
export async function hashString(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await getSubtle().digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Hash a hook by its text. Returns first 16 chars of SHA-256 hex. */
export async function hashHook(text: string): Promise<string> {
  return hashString(`hook:${text}`);
}

/** Hash a topic by its name. Returns first 16 chars of SHA-256 hex. */
export async function hashTopic(name: string): Promise<string> {
  return hashString(`topic:${name}`);
}

/** Hash an angle (combination of hook + topic). Returns first 16 chars of SHA-256 hex. */
export async function hashAngle(hookText: string, topicName: string): Promise<string> {
  return hashString(`angle:${hookText}|${topicName}`);
}
