import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET /api/carousels/[id]/slides/[idx]/download?type=composed|base
// Proxies the image from Supabase Storage with Content-Disposition: attachment
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    const { id, idx: idxStr } = await params;
    const idx = parseInt(idxStr, 10);
    const type = req.nextUrl.searchParams.get('type') ?? 'composed';

    if (isNaN(idx) || idx < 0) {
      return NextResponse.json({ error: 'invalid_idx' }, { status: 400 });
    }

    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = await createClient();

    // Verify user owns the carousel
    const { data: project, error: projectError } = await supabase
      .from('carousel_projects')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const { data: slide, error: slideError } = await supabase
      .from('carousel_slides')
      .select('image_path, composed_path')
      .eq('carousel_id', id)
      .eq('idx', idx)
      .single();

    if (slideError || !slide) {
      return NextResponse.json({ error: 'slide_not_found' }, { status: 404 });
    }

    const path = type === 'base' ? slide.image_path : (slide.composed_path ?? slide.image_path);

    if (!path) {
      return NextResponse.json({ error: 'image_not_ready' }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data: blob, error: downloadErr } = await admin.storage
      .from('carousels')
      .download(path);

    if (downloadErr || !blob) {
      return NextResponse.json({ error: 'download_failed' }, { status: 502 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const filename = `slide-${idx + 1}-${type}.png`;

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(arrayBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error('[GET /api/carousels/[id]/slides/[idx]/download]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
