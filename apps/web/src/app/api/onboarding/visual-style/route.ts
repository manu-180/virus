import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

type Body = {
  defaultPreset: 'minimal' | 'bold' | 'editorial';
  accentColor?: string;
  fontPreference?: string;
};

const VALID_PRESETS = ['minimal', 'bold', 'editorial'] as const;

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.defaultPreset || !VALID_PRESETS.includes(body.defaultPreset)) {
    return NextResponse.json(
      { error: 'defaultPreset is required and must be one of: minimal, bold, editorial' },
      { status: 400 }
    );
  }

  if (body.accentColor !== undefined && typeof body.accentColor !== 'string') {
    return NextResponse.json({ error: 'accentColor must be a string' }, { status: 400 });
  }

  if (body.fontPreference !== undefined && typeof body.fontPreference !== 'string') {
    return NextResponse.json({ error: 'fontPreference must be a string' }, { status: 400 });
  }

  const visualStylePreference: Record<string, unknown> = {
    defaultPreset: body.defaultPreset,
  };
  if (body.accentColor) visualStylePreference.accentColor = body.accentColor;
  if (body.fontPreference) visualStylePreference.fontPreference = body.fontPreference;

  const { error: profileErr } = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ visual_style_preference: visualStylePreference } as any)
    .eq('id', user.id);

  if (profileErr) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (project) {
    await supabase
      .from('project_brand')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ visual_style: visualStylePreference } as any)
      .eq('project_id', project.id)
      .eq('is_current', true);
  }

  return NextResponse.json({ ok: true });
}
