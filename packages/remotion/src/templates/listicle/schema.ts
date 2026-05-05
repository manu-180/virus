import { z } from 'zod';
import { videoInputSchema } from '../../lib/types';

export const listicleSchema = videoInputSchema.extend({
  listicle: z.object({
    title: z.string(),
    items: z.array(
      z.object({
        rank: z.number(),
        name: z.string(),
        tagline: z.string(),
        demoCodeSnippet: z
          .object({ language: z.string(), code: z.string() })
          .optional(),
        screenshotUrl: z.string().url().optional(),
        hidden: z.boolean().default(false),
      })
    ),
  }),
});

export type ListicleInput = z.infer<typeof listicleSchema>;
