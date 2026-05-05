import { z } from 'zod';
import { videoInputSchema } from '../../lib/types';

export const hotTakeSchema = videoInputSchema.extend({
  sideA: z.string().default('CURSOR'),
  sideB: z.string().default('COPILOT'),
  tweets: z
    .array(
      z.object({
        name: z.string(),
        handle: z.string(),
        text: z.string(),
        avatar: z.string().optional(),
      })
    )
    .default([]),
  pollOptions: z.array(z.string()).min(2).max(4).default(['CURSOR', 'COPILOT', 'CLAUDE']),
});

export type HotTakeInput = z.infer<typeof hotTakeSchema>;
