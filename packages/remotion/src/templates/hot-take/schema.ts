import { z } from 'zod';
import { videoInputSchema } from '../../lib/types';

// Mirrors `RenderAssets` from `@virus/shared/visuals`. Kept local to the
// template because Remotion parses input props client-side and we want the
// schema to be self-contained per composition.
const AssetRefSchema = z.object({
  url: z.string().url(),
  type: z.enum(['video', 'image']),
  durationSec: z.number().optional(),
});

const RenderAssetsSchema = z
  .object({
    hook: AssetRefSchema.optional(),
    reveal: AssetRefSchema.optional(),
    cta: AssetRefSchema.optional(),
  })
  .optional();

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
  assets: RenderAssetsSchema,
});

export type HotTakeInput = z.infer<typeof hotTakeSchema>;
