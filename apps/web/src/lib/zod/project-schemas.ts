import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  niche: z.string().min(2).max(50),
  language: z.string().default('es-AR'),
  themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0175C2'),
  voiceCloneId: z.string().optional(),
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export const UploadProjectFileSchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(['viral_patterns', 'project_info']),
});
