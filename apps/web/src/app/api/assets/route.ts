import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — list-style refresh

const CATEGORY_VALUES = ['hook', 'reveal', 'cta'] as const;
const TYPE_VALUES = ['video', 'image'] as const;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

/**
 * GET /api/assets
 *
 * List visual assets owned by the caller, scoped to the active project. RLS
 * enforces ownership; this endpoint just adds filters and signed previews.
 *
 * Query params:
 *  - projectId  (required)
 *  - category   = hook | reveal | cta
 *  - type       = video | image
 *  - burned     = true | false  (default: false — hide burned)
 *  - tag        single tag substring match (case-sensitive on the tags array)
 *  - page       1-based page number (default: 1)
 *  - limit      page size, max 60 (default: 24)
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireUser();
    if (!ctx) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { supabase } = ctx;

    const sp = req.nextUrl.searchParams;

    const projectId = sp.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId_required' }, { status: 400 });
    }

    const rawCategory = sp.get('category');
    const category =
      rawCategory && (CATEGORY_VALUES as readonly string[]).includes(rawCategory)
        ? rawCategory
        : null;

    const rawType = sp.get('type');
    const type =
      rawType && (TYPE_VALUES as readonly string[]).includes(rawType) ? rawType : null;

    const rawBurned = sp.get('burned');
    // default: hide burned (burned=false)
    let burnedFilter: boolean | 'all' = false;
    if (rawBurned === 'true') burnedFilter = true;
    else if (rawBurned === 'all') burnedFilter = 'all';

    const tag = sp.get('tag');

    const page = Math.max(1, Number(sp.get('page') ?? '1') || 1);
    const limit = Math.min(60, Math.max(1, Number(sp.get('limit') ?? '24') || 24));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // NOTE: `visual_assets` / `video_assets_used` are not yet in the generated
    // Database types (migrations 0014/0017 land in a separate phase). Until the
    // types are regenerated we go through `any` at the table boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (supabase as any)
      .from('visual_assets')
      .select(
        'id, project_id, type, category, provider, status, prompt, prompt_hash, template, language, storage_path, duration_sec, width, height, theme_color, tags, burned, last_used_at, error, created_at',
        { count: 'exact' },
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (category) query = query.eq('category', category);
    if (type) query = query.eq('type', type);
    if (burnedFilter !== 'all') query = query.eq('burned', burnedFilter);
    if (tag) query = query.contains('tags', [tag]);

    const { data, count, error } = await query;
    if (error) {
      console.error('[GET /api/assets] query error', error);
      return NextResponse.json({ error: 'query_failed' }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = data ?? [];

    // Sign URLs in batch where possible
    const assets = await Promise.all(
      rows.map(async (row) => {
        let url: string | null = null;
        if (row.storage_path && row.status === 'ready') {
          const { data: signed } = await supabase.storage
            .from('visual-assets')
            .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
          url = signed?.signedUrl ?? null;
        }
        return { ...row, url };
      }),
    );

    return NextResponse.json(
      {
        assets,
        page,
        limit,
        total: count ?? assets.length,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[GET /api/assets]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
