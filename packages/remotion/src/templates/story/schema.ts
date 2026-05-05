import { z } from 'zod';
import { videoInputSchema } from '../../lib/types';

export const storySchema = videoInputSchema.extend({
  story: z.object({
    timelineEvents: z.array(
      z.object({
        time: z.string(),
        label: z.string(),
      })
    ),
    bugReveal: z.object({
      beforeCode: z.string(),
      afterCode: z.string(),
      language: z.string(),
      offendingLine: z.number(),
    }),
    chatMessages: z
      .array(
        z.object({
          author: z.string(),
          text: z.string(),
          atSec: z.number(),
        })
      )
      .optional(),
  }),
});

export type StoryInput = z.infer<typeof storySchema>;
