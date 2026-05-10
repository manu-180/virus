/**
 * Pure state inference helpers for the carousel retry pipeline.
 *
 * `inferLastOkStep` examines a snapshot of carousel_slides + caption count to
 * determine which pipeline step completed successfully last. The retry endpoint
 * uses this to resume from the correct step rather than restarting from scratch.
 *
 * Step order:
 *  none → plan → slides → composing → captions
 *
 * Dispatch map:
 *  none      → virus/carousel.created
 *  plan      → virus/carousel.slides.requested
 *  slides    → virus/carousel.slides.composed.requested
 *  composing → virus/carousel.caption.requested
 *  captions  → (mark ready, no dispatch needed)
 */

export type LastOkStep = 'none' | 'plan' | 'slides' | 'composing' | 'captions';

export interface CarouselStateSnapshot {
  /** Rows from carousel_slides for this carousel */
  slides: Array<{
    status: string;
    image_path: string | null;
    composed_path: string | null;
  }>;
  /** Count of rows in carousel_captions for this carousel */
  captionCount: number;
  /** Current value of carousel_projects.status */
  status: string;
}

/**
 * Returns the last pipeline step that completed successfully.
 * Used by the retry endpoint to dispatch the correct resumption event.
 */
export function inferLastOkStep(state: CarouselStateSnapshot): LastOkStep {
  // Captions exist → caption generation completed
  if (state.captionCount > 0) return 'captions';

  // Any slide has composed_path → overlay composition completed
  const hasComposedSlides = state.slides.some((s) => s.composed_path !== null);
  if (hasComposedSlides || state.status === 'generating_captions') return 'composing';

  // Any slide has image_path → image generation completed for at least one slide
  const hasGeneratedImages = state.slides.some((s) => s.image_path !== null);
  if (hasGeneratedImages || state.status === 'composing') return 'slides';

  // Slide rows exist → plan step persisted slide specs
  if (state.slides.length > 0 || state.status === 'generating_slides') return 'plan';

  return 'none';
}
