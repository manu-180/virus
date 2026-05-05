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

export const tipSchema = videoInputSchema.extend({
  variant: z.enum(['dense', 'minimal', 'split']).default('dense'),
  assets: RenderAssetsSchema,
});

export type TipInput = z.infer<typeof tipSchema>;
