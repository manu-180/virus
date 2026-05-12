/**
 * Inngest event payloads for the carousel generation pipeline.
 *
 * carousel.created → generate-carousel-plan
 * → carousel.slides.requested → generate-carousel-slides
 *   → carousel.slide.generated (per slide)
 *   → carousel.slides.composed.requested → compose-carousel-overlay
 *     → carousel.caption.requested (Tanda 9)
 *
 * carousel.failed is emitted on catastrophic failure (e.g. zero slides generated).
 */

export interface CarouselCreatedEvent {
  name: 'virus/carousel.created';
  data: {
    carouselId: string;
    userId: string;
  };
}

export interface CarouselSlidesRequestedEvent {
  name: 'virus/carousel.slides.requested';
  data: {
    carouselId: string;
    userId: string;
  };
}

export interface CarouselSlideGeneratedEvent {
  name: 'virus/carousel.slide.generated';
  data: {
    carouselId: string;
    idx: number;
    userId: string;
  };
}

export interface CarouselSlidesComposedRequestedEvent {
  name: 'virus/carousel.slides.composed.requested';
  data: {
    carouselId: string;
    userId: string;
    succeededIdxs: number[];
  };
}

export interface CarouselCaptionRequestedEvent {
  name: 'virus/carousel.caption.requested';
  data: {
    carouselId: string;
    userId: string;
  };
}

export interface CarouselFailedEvent {
  name: 'virus/carousel.failed';
  data: {
    carouselId: string;
    step: string;
    error: string;
  };
}

export interface CarouselCompletedEvent {
  name: 'virus/carousel.completed';
  data: {
    carouselId: string;
    userId: string;
    captionCount: number;
  };
}

export interface CarouselSlideRegenerateRequestedEvent {
  name: 'virus/carousel.slide.regenerate.requested';
  data: {
    carouselId: string;
    userId: string;
    idx: number;
    /**
     * Optional free-form hint the user typed in the regenerate UI to steer
     * the new image — e.g. "más colorido", "sin manos", "más oscuro".
     * Empty / missing means a plain regenerate with no extra direction.
     */
    hint?: string;
  };
}

export type CarouselEvents = {
  'virus/carousel.created': CarouselCreatedEvent;
  'virus/carousel.slides.requested': CarouselSlidesRequestedEvent;
  'virus/carousel.slide.generated': CarouselSlideGeneratedEvent;
  'virus/carousel.slides.composed.requested': CarouselSlidesComposedRequestedEvent;
  'virus/carousel.caption.requested': CarouselCaptionRequestedEvent;
  'virus/carousel.failed': CarouselFailedEvent;
  'virus/carousel.completed': CarouselCompletedEvent;
  'virus/carousel.slide.regenerate.requested': CarouselSlideRegenerateRequestedEvent;
};
