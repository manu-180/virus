import { GoogleGenAI } from '@google/genai';

/**
 * Input for {@link generateImageGemini}.
 *
 * Uses the **Gemini 2.5 Flash Image** model (a.k.a. "Nano Banana") — the public
 * image generation model accessible via the Gemini API with no allowlist
 * required. NOT to be confused with `imagen-4.0-generate-001` (Vertex AI),
 * which is gated and requires per-project access approval.
 */
export interface GeminiGenInput {
  /** Final prompt text (already includes style + negative tags). */
  prompt: string;
  /** Theme color (informational — the prompt builder bakes the accent in). */
  themeColor: string;
  /** Aspect ratio. Default `9:16` for vertical short-form. `4:5` for IG carousel. */
  aspectRatio?: '9:16' | '4:5' | '1:1';
}

/** Successful Gemini image generation result. */
export interface GeminiGenOutput {
  /** Raw image bytes (PNG or JPEG depending on what the model returns). */
  bytes: Buffer;
  /** Approximate output dimensions (Nano Banana doesn't return exact dims). */
  width: number;
  height: number;
  /** USD cost — Nano Banana pricing as of 2026-05. */
  costUsd: number;
}

/**
 * Nano Banana pricing: $30 per 1M output tokens; each image ≈ 1290 tokens
 * → ≈ $0.039 per image. We round to $0.04 for circuit-breaker accounting.
 */
const NANO_BANANA_USD_PER_IMAGE = 0.04;

const DEFAULT_MODEL = 'gemini-2.5-flash-image';

/**
 * Generate a single hero image with Gemini 2.5 Flash Image (Nano Banana).
 *
 * - Reads `GOOGLE_AI_API_KEY` from `process.env`. Throws if missing.
 * - Returns image bytes (Node `Buffer`) decoded from the SDK's base64 payload.
 * - Default model: `gemini-2.5-flash-image`. Override via `ASSETS_GEMINI_MODEL`.
 *
 * Aspect ratio is communicated to the model via the prompt text since
 * `generateContent` doesn't accept a structured aspect param for this model.
 * The dimensions returned in {@link GeminiGenOutput} are nominal targets.
 */
export async function generateImageGemini(input: GeminiGenInput): Promise<GeminiGenOutput> {
  const apiKey = process.env['GOOGLE_AI_API_KEY'];
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not set');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env['ASSETS_GEMINI_MODEL'] ?? DEFAULT_MODEL;
  const aspectRatio = input.aspectRatio ?? '9:16';

  // Nano Banana takes aspect-ratio as part of the prompt because the
  // generateContent endpoint has no structured aspectRatio parameter.
  const dims = dimensionsFor(aspectRatio);
  const promptWithAspect =
    `${input.prompt}\n\n` +
    `Render as a ${aspectRatio === '1:1' ? 'square' : 'vertical'} ${aspectRatio} (${dims[0]}x${dims[1]}) composition.`;

  const response = await ai.models.generateContent({
    model,
    contents: promptWithAspect,
    config: {
      // Tell the model we want an image back, not text.
      responseModalities: ['IMAGE'],
    },
  });

  // Walk candidate parts to find the inline image payload.
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => {
    const mt = p.inlineData?.mimeType ?? '';
    return mt.startsWith('image/');
  });

  if (!imagePart?.inlineData?.data) {
    // Some failure modes return text describing why (RAI policy, prompt too vague, etc.)
    const textPart = parts.find((p) => p.text);
    const reason = textPart?.text ?? 'unknown';
    throw new Error(`gemini_no_image: ${reason.slice(0, 200)}`);
  }

  const bytes = Buffer.from(imagePart.inlineData.data, 'base64');
  const [width, height] = dimensionsFor(aspectRatio);

  return {
    bytes,
    width,
    height,
    costUsd: NANO_BANANA_USD_PER_IMAGE,
  };
}

function dimensionsFor(aspectRatio: '9:16' | '4:5' | '1:1'): [number, number] {
  switch (aspectRatio) {
    case '9:16':
      return [1080, 1920];
    case '4:5':
      return [1080, 1350];
    case '1:1':
      return [1024, 1024];
  }
}
