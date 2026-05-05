'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

export type BrandStepInput = {
  handle: string;
  language: string;
  audience: string;
  topics: string[];
  contentMix: { educational: number; promotional: number; personal: number };
};

export type StarterIdea = {
  hookText: string;
  angle: string;
  format: string;
};

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

// ---------------------------------------------------------------------------
// Step 1: Save brand data
// ---------------------------------------------------------------------------

export async function saveBrandStep(input: BrandStepInput): Promise<Result<void>> {
  try {
    const user = await getUser();
    const supabase = await createClient();

    const { error } = await supabase
      .from('profiles')
      .update({
        handle: input.handle.trim(),
        default_language: input.language,
        brand_voice: {
          audience: input.audience.trim(),
          topics: input.topics,
          contentMix: input.contentMix,
        },
      })
      .eq('id', user.id);

    if (error) return { ok: false, error: error.message };
    revalidatePath('/onboarding');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

// ---------------------------------------------------------------------------
// Step 2: Save voice choice
// ---------------------------------------------------------------------------

export async function saveVoiceStep(input: {
  voiceCloneId?: string;
  skip: boolean;
}): Promise<Result<void>> {
  try {
    const user = await getUser();
    const supabase = await createClient();

    const { error } = await supabase
      .from('profiles')
      .update({
        default_voice_clone_id: input.voiceCloneId ?? null,
        onboarding_voice_skipped: input.skip,
      })
      .eq('id', user.id);

    if (error) return { ok: false, error: error.message };
    revalidatePath('/onboarding');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

// ---------------------------------------------------------------------------
// Step 3: Generate starter ideas (no DB write)
// ---------------------------------------------------------------------------

export async function generateStarterIdeas(): Promise<Result<StarterIdea[]>> {
  try {
    const user = await getUser();
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('brand_voice')
      .eq('id', user.id)
      .single();

    const brandVoice = (profile?.brand_voice ?? {}) as { topics?: string[] };
    const topic = brandVoice.topics?.[0] ?? 'tu área de expertise';

    const ideas: StarterIdea[] = [
      {
        hookText: `El error más común en ${topic} que nadie te dice`,
        angle: 'Contrarian take con datos propios',
        format: 'talking-head',
      },
      {
        hookText: `Lo que aprendí después de 1 año trabajando en ${topic}`,
        angle: 'Historia personal + lecciones clave',
        format: 'talking-head',
      },
      {
        hookText: `Cómo hago ${topic} en menos de 10 minutos`,
        angle: 'Tutorial paso a paso',
        format: 'screen-capture',
      },
    ];

    return { ok: true, data: ideas };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

// ---------------------------------------------------------------------------
// Step 3: Complete onboarding — create pillars, video idea, mark complete
// ---------------------------------------------------------------------------

export async function completeOnboarding(
  selectedIdea: StarterIdea
): Promise<Result<{ videoIdeaId: string }>> {
  try {
    const user = await getUser();
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('brand_voice')
      .eq('id', user.id)
      .single();

    const brandVoice = (profile?.brand_voice ?? {}) as {
      topics?: string[];
      contentMix?: { educational: number; promotional: number; personal: number };
    };

    const mix = brandVoice.contentMix ?? { educational: 60, promotional: 30, personal: 10 };
    const topics = brandVoice.topics ?? [];

    // Create a default project for this user (per-project schema requires it).
    // Pillars, ideas and videos are all project-scoped.
    const { data: defaultProject, error: projectError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        slug: 'default',
        name: 'Mi proyecto',
        niche: 'general',
      })
      .select('id')
      .single();

    if (projectError || !defaultProject) {
      return { ok: false, error: projectError?.message ?? 'No se pudo crear el proyecto' };
    }

    const projectId = defaultProject.id;

    // Create content pillars (project-scoped). user_id is auto-set by trigger
    // but we pass it explicitly to satisfy the type.
    const { data: pillars } = await supabase
      .from('content_pillars')
      .insert([
        {
          project_id: projectId,
          user_id: user.id,
          name: 'Educativo',
          weight: mix.educational,
          description: 'Contenido que enseña y aporta valor',
          example_themes: topics.slice(0, 2),
        },
        {
          project_id: projectId,
          user_id: user.id,
          name: 'Promocional',
          weight: mix.promotional,
          description: 'Contenido que muestra tu trabajo y resultados',
          example_themes: [] as string[],
        },
        {
          project_id: projectId,
          user_id: user.id,
          name: 'Personal',
          weight: mix.personal,
          description: 'Tu historia y proceso',
          example_themes: [] as string[],
        },
      ])
      .select('id')
      .order('created_at', { ascending: true });

    // Create video idea linked to first pillar
    const educationalPillarId = pillars?.[0]?.id ?? null;

    const { data: videoIdea, error: ideaError } = await supabase
      .from('video_ideas')
      .insert({
        project_id: projectId,
        user_id: user.id,
        hook: selectedIdea.hookText,
        angle: selectedIdea.angle,
        format: selectedIdea.format,
        status: 'approved',
        pillar_id: educationalPillarId,
      })
      .select('id')
      .single();

    if (ideaError) return { ok: false, error: ideaError.message };

    // Mark onboarding complete
    await supabase
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id);

    revalidatePath('/dashboard');
    return { ok: true, data: { videoIdeaId: videoIdea.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
