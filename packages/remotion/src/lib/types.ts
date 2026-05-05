import { z } from 'zod';

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
      codeSnippet: z.object({
        language: z.string(),
        code: z.string(),
      }).optional(),
      soundEffect: z.enum(['whoosh', 'click', 'ding', 'glitch', 'pop']).nullable().optional(),
    })
  ),
  captions: z.object({
    words: z.array(z.object({
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
    })),
  }),
  brand: z.object({
    handle: z.string(),
    logoUrl: z.string().url().optional(),
  }),
});

export type VideoInput = z.infer<typeof videoInputSchema>;
