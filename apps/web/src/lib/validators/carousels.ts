import { z } from 'zod';

export const CarouselBriefSchema = z.object({
  topic: z.string().min(3, 'Mínimo 3 caracteres').max(500),
  angle: z.enum(['educational', 'contrarian', 'story-arc', 'before-after', 'listicle']),
  tone: z.enum(['direct', 'authoritative', 'casual', 'contrarian']),
  audience: z.string().max(200).optional(),
  slideCount: z.number().int().min(3).max(10),
  language: z.enum(['es', 'en']),
  cta: z.string().max(200).optional(),
});

export const CreateCarouselSchema = z.object({
  projectId: z.string().uuid('Seleccioná un proyecto'),
  brief: CarouselBriefSchema,
  stylePreset: z.enum(['minimal', 'bold', 'editorial']),
});

export type CreateCarouselInput = z.infer<typeof CreateCarouselSchema>;
