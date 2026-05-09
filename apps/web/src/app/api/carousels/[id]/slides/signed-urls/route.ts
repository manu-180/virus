import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const SIGNED_URL_TTL = 3600; // 1 hour

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET /api/carousels/[id]/slides/signed-urls?p=path1&p=path2
// Returns { urls: Record<string, string> } mapping storage path → signed URL
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // Verify user owns this carousel
    const supabase = await createClient();
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

    const paths = req.nextUrl.searchParams.getAll('p').filter(Boolean);
    if (paths.length === 0) {
      return NextResponse.json({ urls: {} });
    }

    const admin = createAdminClient();
    const entries = await Promise.allSettled(
      paths.map(async (path) => {
        const { data, error } = await admin.storage
          .from('carousels')
          .createSignedUrl(path, SIGNED_URL_TTL);
        if (error || !data?.signedUrl) throw new Error(error?.message ?? 'no url');
        return [path, data.signedUrl] as [string, string];
      }),
    );

    const urls: Record<string, string> = {};
    for (const result of entries) {
      if (result.status === 'fulfilled') {
        const [path, url] = result.value;
        urls[path] = url;
      }
    }

    return NextResponse.json({ urls });
  } catch (err) {
    console.error('[GET /api/carousels/[id]/slides/signed-urls]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
