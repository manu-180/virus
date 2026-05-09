// ---------------------------------------------------------------------------
// DB row types — mirror carousel tables defined in ADR
// ---------------------------------------------------------------------------

export const CAROUSEL_STATUSES = [
  'pending',
  'generating_slides',
  'composing',
  'generating_captions',
  'ready',
  'failed',
  'published_manually',
] as const;

export type CarouselStatus = (typeof CAROUSEL_STATUSES)[number];

export interface CarouselProject {
  id: string;
  project_id: string;
  user_id: string;
  status: CarouselStatus;
  brief: string;
  slide_count: number;
  style_preset: 'bold' | 'minimal' | 'editorial';
  error: string | null;
  inngest_run_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarouselSlide {
  id: string;
  carousel_id: string;
  user_id: string;
  idx: number;
  prompt: string;
  image_path: string | null;
  composed_path: string | null;
  overlay_text: string | null;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarouselCaption {
  id: string;
  carousel_id: string;
  user_id: string;
  variant_idx: number;
  text: string;
  framework: 'aida' | 'pas' | 'hook_story_cta';
  selected: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Runtime types — used between service boundaries, not persisted as-is
// ---------------------------------------------------------------------------

export type CarouselBrief = {
  topic: string;
  angle: 'contrarian' | 'educational' | 'story-arc' | 'before-after' | 'listicle';
  tone: 'direct' | 'authoritative' | 'casual' | 'contrarian';
  audience: string;
  slideCount: number;
  stylePreset: 'minimal' | 'bold' | 'editorial';
  language: 'es' | 'en';
  cta: string;
};

export type SlideSpec = {
  idx: number;
  role: 'hook' | 'problem' | 'insight' | 'data' | 'example' | 'cta';
  headline: string;
  body?: string;
  visualPrompt: string;
};

export type CaptionVariant = {
  idx: number;
  framework: 'hook-pas-cta' | 'hook-aida' | 'contrarian';
  text: string;
  hashtags: string[];
};
