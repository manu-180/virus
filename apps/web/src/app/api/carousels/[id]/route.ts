import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { failIfStuck, type CarouselWatchdogRow } from '@/server/carousel/watchdog';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = await createClient();

    const { data: project, error: projectError } = await supabase
      .from('carousel_projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    await failIfStuck(project as unknown as CarouselWatchdogRow);

    const { data: slides, error: slidesError } = await supabase
      .from('carousel_slides')
      .select('*')
      .eq('carousel_id', id)
      .order('idx', { ascending: true });

    if (slidesError) {
      console.error('[GET /api/carousels/[id]] slides error:', slidesError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    const { data: captions, error: captionsError } = await supabase
      .from('carousel_captions')
      .select('*')
      .eq('carousel_id', id)
      .order('variant_idx', { ascending: true });

    if (captionsError) {
      console.error('[GET /api/carousels/[id]] captions error:', captionsError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    return NextResponse.json({
      project,
      slides: slides ?? [],
      captions: captions ?? [],
    });
  } catch (err) {
    console.error('[GET /api/carousels/[id]]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
