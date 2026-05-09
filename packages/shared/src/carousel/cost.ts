// ---------------------------------------------------------------------------
// Carousel cost estimation — USD before calling any external API.
// ---------------------------------------------------------------------------

// Gemini 2.5 Flash Image (Nano Banana) — 2026-05 pricing
const GEMINI_NORMAL_USD_PER_IMAGE = 0.039;
export const GEMINI_BATCH_USD_PER_IMAGE = 0.0195;

// Claude Sonnet 4.6 — 2026-05 pricing
const CLAUDE_INPUT_USD_PER_MTOK = 3.0;
const CLAUDE_OUTPUT_USD_PER_MTOK = 15.0;

// Estimated token usage per carousel step (conservative upper bound)
const SLIDE_PLAN_INPUT_BASE_TOK = 1200;
const SLIDE_PLAN_OUTPUT_TOK_PER_SLIDE = 80;
const CAPTION_INPUT_TOK_PER_VARIANT = 600;
const CAPTION_OUTPUT_TOK_PER_VARIANT = 200;

export function estimateCarouselCost(
  slideCount: number,
  captionVariants = 3,
): { images: number; text: number; total: number } {
  const images = slideCount * GEMINI_NORMAL_USD_PER_IMAGE;

  const totalInputTok =
    SLIDE_PLAN_INPUT_BASE_TOK +
    slideCount * SLIDE_PLAN_OUTPUT_TOK_PER_SLIDE +
    captionVariants * CAPTION_INPUT_TOK_PER_VARIANT;

  const totalOutputTok =
    slideCount * SLIDE_PLAN_OUTPUT_TOK_PER_SLIDE +
    captionVariants * CAPTION_OUTPUT_TOK_PER_VARIANT;

  const text =
    (totalInputTok / 1_000_000) * CLAUDE_INPUT_USD_PER_MTOK +
    (totalOutputTok / 1_000_000) * CLAUDE_OUTPUT_USD_PER_MTOK;

  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

  return {
    images: round4(images),
    text: round4(text),
    total: round4(images + text),
  };
}
