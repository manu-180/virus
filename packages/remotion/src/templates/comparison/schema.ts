import { z } from 'zod';
import { videoInputSchema } from '../../lib/types';

export const comparisonSchema = videoInputSchema.extend({
  comparison: z.object({
    toolA: z.object({
      name: z.string(),
      logoUrl: z.string().url().optional(),
      color: z.string(),
    }),
    toolB: z.object({
      name: z.string(),
      logoUrl: z.string().url().optional(),
      color: z.string(),
    }),
    rounds: z.array(
      z.object({
        title: z.string(),
        taskDescription: z.string(),
        toolAResult: z.string(),
        toolBResult: z.string(),
        winner: z.enum(['A', 'B', 'tie']),
      })
    ),
    finalScore: z.object({ a: z.number(), b: z.number() }),
    overallWinner: z.enum(['A', 'B', 'tie']),
  }),
});

export type ComparisonInput = z.infer<typeof comparisonSchema>;
