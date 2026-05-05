import { z } from 'zod';

export type CompositionId =
  | 'tip'
  | 'hot-take'
  | 'speed-build'
  | 'listicle'
  | 'story'
  | 'comparison';

export type MusicMood = 'lofi' | 'synthwave' | 'phonk' | 'cinematic';

// Kept in sync with packages/remotion/src/lib/types.ts — source of truth for Remotion inputProps
export const videoInputSchema = z.object({
  totalDurationSec: z.number().min(8).max(180),
  themeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  language: z.enum(['es', 'en']),
  audioUrl: z.string().url(),
  musicMood: z.enum(['lofi', 'synthwave', 'phonk', 'cinematic']).optional(),
  segments: z.array(
    z.object({
      index: z.number(),
      role: z.enum(['hook', 'setup', 'development', 'mini_payoff', 'reveal', 'cta']),
      startSec: z.number(),
      endSec: z.number(),
      voiceover: z.string(),
      onScreenText: z.string().optional(),
      visualCue: z.string(),
      codeSnippet: z
        .object({
          language: z.string(),
          code: z.string(),
        })
        .optional(),
      soundEffect: z.enum(['whoosh', 'click', 'ding', 'glitch', 'pop']).nullable().optional(),
    }),
  ),
  captions: z.object({
    words: z.array(
      z.object({
        text: z.string(),
        startMs: z.number(),
        endMs: z.number(),
      }),
    ),
  }),
  brand: z.object({
    handle: z.string(),
    logoUrl: z.string().url().optional(),
  }),
});

export type VideoInput = z.infer<typeof videoInputSchema>;

export interface RenderOptions {
  composition: CompositionId;
  inputProps: VideoInput;
  outName?: string;
}

export interface StartRenderResult {
  renderId: string;
  bucketName: string;
}

export interface RenderProgressResult {
  done: boolean;
  outputFile?: string;
  errors?: string[];
  overallProgress: number;
}
