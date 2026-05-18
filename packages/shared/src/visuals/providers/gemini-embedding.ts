import { GoogleGenAI } from '@google/genai';

/**
 * Text embeddings via Gemini `text-embedding-004`.
 *
 * Used by the carousel image library ({@link ../../carousel/image-library.ts})
 * to turn a slide's role + topic + headline + visual prompt into a 768-dim
 * vector. The same vector is stored alongside every generated image and used
 * as the query vector when looking for a reusable image — so "the image
 * matches what the slide says" becomes a cosine-similarity comparison.
 *
 * Reads the same `GOOGLE_AI_API_KEY` the image generator uses. The model id
 * can be overridden with `CAROUSEL_EMBEDDING_MODEL`.
 */

/** Native output dimensionality of text-embedding-004. Matches the
 *  `vector(768)` column in migration 0038. */
export const EMBEDDING_DIMENSIONS = 768;

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';

/**
 * Embed a single string into a 768-dim semantic vector.
 *
 * `taskType: 'SEMANTIC_SIMILARITY'` is used for BOTH storage and query so the
 * comparison is symmetric ("do these two texts mean the same thing").
 *
 * Throws on a missing key, an API error, or an empty response. Callers in the
 * image-library treat any throw as "no embedding available" and degrade
 * gracefully to plain generation — embeddings are an optimization, never a
 * hard dependency of the carousel pipeline.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env['GOOGLE_AI_API_KEY'];
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not set');
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('embed_empty_input');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env['CAROUSEL_EMBEDDING_MODEL'] ?? DEFAULT_EMBEDDING_MODEL;

  const response = await ai.models.embedContent({
    model,
    contents: [trimmed],
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'SEMANTIC_SIMILARITY',
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error('gemini_embedding_empty');
  }

  return values;
}
