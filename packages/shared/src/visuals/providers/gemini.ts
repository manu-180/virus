import { GoogleGenAI, PersonGeneration } from '@google/genai';

/** Input for {@link generateImageGemini}. */
export interface GeminiGenInput {
  /** Final prompt text (already includes style + negative tags). */
  prompt: string;
  /** Theme color (informational — the prompt builder bakes the accent in). */
  themeColor: string;
  /** Aspect ratio. Default `9:16` for vertical short-form. */
  aspectRatio?: '9:16' | '1:1';
}

/** Successful Gemini / Imagen image generation result. */
export interface GeminiGenOutput {
  /** Raw image bytes (PNG). */
  bytes: Buffer;
  /** Hardcoded for the 9:16 vertical preset we request. */
  width: number;
  height: number;
  /** USD cost — Imagen 4 standard pricing as of 2026-05. */
  costUsd: number;
}

/** Imagen 4 standard pricing: $0.04 per image (spec value). */
const GEMINI_IMAGEN_4_USD_PER_IMAGE = 0.04;

/**
 * Generate a single hero image with Gemini / Imagen.
 *
 * - Reads `GOOGLE_AI_API_KEY` from `process.env`. Throws if missing.
 * - Returns PNG bytes (Node `Buffer`) decoded from the SDK's base64 payload.
 *
 * Pricing as of 2026-05: Imagen 4 = $0.04/image. Override the model via
 * `ASSETS_GEMINI_MODEL` env var if needed (defaults to `imagen-4.0-generate-001`).
 */
export async function generateImageGemini(input: GeminiGenInput): Promise<GeminiGenOutput> {
  const apiKey = process.env['GOOGLE_AI_API_KEY'];
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not set');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env['ASSETS_GEMINI_MODEL'] ?? 'imagen-4.0-generate-001';
  const aspectRatio = input.aspectRatio ?? '9:16';

  const result = await ai.models.generateImages({
    model,
    prompt: input.prompt,
    config: {
      numberOfImages: 1,
      aspectRatio,
      personGeneration: PersonGeneration.ALLOW_ADULT,
    },
  });

  const generated = result.generatedImages?.[0]?.image;
  if (!generated?.imageBytes) {
    const reason = result.generatedImages?.[0]?.raiFilteredReason;
    throw new Error(`gemini_no_image${reason ? `: ${reason}` : ''}`);
  }

  const bytes = Buffer.from(generated.imageBytes, 'base64');
  const [width, height] = dimensionsFor(aspectRatio);

  return {
    bytes,
    width,
    height,
    costUsd: GEMINI_IMAGEN_4_USD_PER_IMAGE,
  };
}

function dimensionsFor(aspectRatio: '9:16' | '1:1'): [number, number] {
  switch (aspectRatio) {
    case '9:16':
      return [1080, 1920];
    case '1:1':
      return [1024, 1024];
  }
}
