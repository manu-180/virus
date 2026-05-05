import { z } from 'zod';
import { videoInputSchema } from '../../lib/types';

export const speedBuildSchema = videoInputSchema.extend({
  speedBuild: z.object({
    elapsedTimeStartSec: z.number().default(0),
    elapsedTimeEndSec: z.number(),
    promptCount: z.number(),
    finalScreenshotUrl: z.string().url().optional(),
    scenes: z.array(
      z.object({
        code: z.string(),
        languageId: z.string(),
        label: z.string().optional(),
        durationFrames: z.number(),
      }),
    ),
  }),
});

export type SpeedBuildInput = z.infer<typeof speedBuildSchema>;
