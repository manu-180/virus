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
  // Hint opcional: id del topic que el usuario eligió en el combobox.
  // Si está + el title coincide → bump al original. Si está + title cambió
  // → crea variante con parent_topic_id apuntando acá. Si NO está → match
  // por title o creación de user_added.
  selectedTopicId: z.string().uuid().nullish(),
});

export type CreateCarouselInput = z.infer<typeof CreateCarouselSchema>;
