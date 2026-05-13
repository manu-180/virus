import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  composeSlide,
  STYLE_PRESETS,
  applyBrandOverrides,
} from '@virus/shared/carousel';
import type { SlideSpec, StylePreset } from '@virus/shared/carousel';

const MAX_HEADLINE = 40;
const MAX_BODY = 120;

interface BrandVisualStyle {
  textColor?: string;
  bodyColor?: string;
  accentColor?: string;
  backgroundColor?: string;
}

function resolvePreset(presetName: string, visualStyle?: BrandVisualStyle): StylePreset {
  const key = presetName as keyof typeof STYLE_PRESETS;
  const base = STYLE_PRESETS[key] ?? STYLE_PRESETS.bold;
  return applyBrandOverrides(base, visualStyle);
}

// PATCH /api/carousels/[id]/slides/[idx]/text
// Body: { headline: string; body?: string }
// Recomposes the slide overlay with the new text, keeping the existing base image.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    const { id, idx: idxStr } = await params;
    const idx = parseInt(idxStr, 10);

    if (isNaN(idx) || idx < 0) {
      return NextResponse.json({ error: 'invalid_idx' }, { status: 400 });
    }

    let headline: string;
    let body: string | undefined;
    try {
      const payload = (await req.json()) as { headline?: unknown; body?: unknown };
      if (typeof payload.headline !== 'string' || payload.headline.trim().length === 0) {
        return NextResponse.json({ error: 'headline_required' }, { status: 400 });
      }
      headline = payload.headline.trim().slice(0, MAX_HEADLINE);
      if (typeof payload.body === 'string' && payload.body.trim().length > 0) {
        body = payload.body.trim().slice(0, MAX_BODY);
      }
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Verify ownership and load context
    const { data: project, error: projectError } = await supabase
      .from('carousel_projects')
      .select('id, user_id, project_id, style_preset')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const admin = createAdminClient();

    // Load slide
    const { data: slideRow, error: slideError } = await admin
      .from('carousel_slides')
      .select('id, idx, image_path, overlay_text')
      .eq('carousel_id', id)
      .eq('idx', idx)
      .single();

    if (slideError || !slideRow) {
      return NextResponse.json({ error: 'slide_not_found' }, { status: 404 });
    }

    if (!slideRow.image_path) {
      return NextResponse.json({ error: 'no_base_image' }, { status: 422 });
    }

    // Parse existing overlay spec to preserve idx / role / visualPrompt
    let existingSpec: SlideSpec = { idx, role: 'insight', headline: '', visualPrompt: '' };
    if (slideRow.overlay_text) {
      try {
        existingSpec = JSON.parse(slideRow.overlay_text as string) as SlideSpec;
      } catch {
        // use defaults
      }
    }

    const newSpec: SlideSpec = {
      idx: existingSpec.idx,
      role: existingSpec.role,
      headline,
      visualPrompt: existingSpec.visualPrompt,
      ...(body !== undefined ? { body } : {}),
    };

    // Load brand for visual style overrides.
    // visual_style is a JSONB column not reflected in generated types — cast via unknown.
    const { data: brandRow } = await admin
      .from('project_brand')
      .select('visual_style')
      .eq('project_id', project.project_id as string)
      .eq('is_current', true)
      .single();

    const visualStyle =
      ((brandRow as unknown as { visual_style: BrandVisualStyle | null } | null)
        ?.visual_style) ?? undefined;
    const preset = resolvePreset(project.style_preset as string, visualStyle);

    // Download base image
    const { data: imageData, error: downloadError } = await admin.storage
      .from('carousels')
      .download(slideRow.image_path as string);

    if (downloadError || !imageData) {
      return NextResponse.json(
        { error: 'download_failed', detail: downloadError?.message },
        { status: 502 },
      );
    }

    const baseImage = Buffer.from(await imageData.arrayBuffer());

    // Compose overlay with new text
    const composed = await composeSlide({ baseImage, slide: newSpec, preset });

    // Upload composed image (upsert — same path, new content)
    const composedPath = `${user.id}/${id}/composed-${idx}.png`;
    const { error: uploadError } = await admin.storage
      .from('carousels')
      .upload(composedPath, composed, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 502 });
    }

    // Persist updated overlay_text
    await admin
      .from('carousel_slides')
      .update({
        overlay_text: JSON.stringify(newSpec),
        composed_path: composedPath,
        status: 'ready',
        error: null,
      })
      .eq('carousel_id', id)
      .eq('idx', idx);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/carousels/[id]/slides/[idx]/text]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
