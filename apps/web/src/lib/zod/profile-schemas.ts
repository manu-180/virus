import { z } from 'zod';

export const UpdateHandleSchema = z.object({
  handle: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guiones bajos'),
});

export const BrandVoiceSchema = z.object({
  pillars: z
    .object({
      educational: z.number().min(0).max(100),
      hotTake: z.number().min(0).max(100),
      personal: z.number().min(0).max(100),
    })
    .refine(
      (p) => p.educational + p.hotTake + p.personal === 100,
      'Los pilares deben sumar 100%',
    ),
  toneChips: z
    .array(z.enum(['directo', 'irónico', 'técnico', 'accesible', 'contrarian', 'entusiasta']))
    .min(1),
  language: z.enum(['es-AR', 'en-US']),
  audience: z.enum(['LATAM', 'Global', 'Mixed']),
  topicsFav: z.array(z.string().min(1).max(50)).max(20),
  topicsAvoid: z.array(z.string().min(1).max(50)).max(20),
  hashtags: z.array(z.string().min(1).max(50)).max(30),
  ctaPreferred: z.enum(['comment_keyword', 'tag_friend', 'save', 'follow']),
  handle: z.string().max(50),
});

export const ScheduleConfigSchema = z.object({
  frequency: z.enum(['1/day', '1/2days', '1/3days', 'manual']),
  preferredTimes: z
    .array(z.string().regex(/^\d{2}:\d{2}$/))
    .min(1)
    .max(5),
  daysOff: z.array(z.number().min(0).max(6)).max(7),
  platforms: z.array(z.string()).min(1),
  autoPublish: z.literal(false),
});

export type UpdateHandleInput = z.infer<typeof UpdateHandleSchema>;
export type BrandVoice = z.infer<typeof BrandVoiceSchema>;
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;
