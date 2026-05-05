import { z } from 'zod';
import { videoInputSchema } from '../../lib/types';

export const tipSchema = videoInputSchema.extend({
  variant: z.enum(['dense', 'minimal', 'split']).default('dense'),
});

export type TipInput = z.infer<typeof tipSchema>;
