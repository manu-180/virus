import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AssetsGrid, type AssetGridRow } from './_components/assets-grid';
import { Library } from 'lucide-react';

export const metadata = {
  title: 'Biblioteca de assets | Virus',
};

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const PAGE_SIZE = 24;

type AssetCategory = 'hook' | 'reveal' | 'cta';
type AssetType = 'video' | 'image';

interface AssetsPageSearchParams {
  category?: string;
  type?: string;
  burned?: string;
  tag?: string;
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<AssetsPageSearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Active project: same pattern used by /dashboard/ideas — most recent project owned by user.
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const projectId = project?.id ?? null;

  let initialAssets: AssetGridRow[] = [];
  let useCounts: Record<string, number> = {};

  if (projectId) {
    // Apply server-side filters from query params (client component refetches on change).
    const category =
      sp.category === 'hook' || sp.category === 'reveal' || sp.category === 'cta'
        ? (sp.category as AssetCategory)
        : null;
    const type =
      sp.type === 'video' || sp.type === 'image' ? (sp.type as AssetType) : null;
    const burnedFilter: boolean | 'all' =
      sp.burned === 'true' ? true : sp.burned === 'all' ? 'all' : false;

    // NOTE: `visual_assets` and `video_assets_used` are not yet in the
    // generated Database types — go through `any` at the table boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (supabase as any)
      .from('visual_assets')
      .select(
        'id, project_id, type, category, provider, status, prompt, prompt_hash, template, language, storage_path, duration_sec, width, height, theme_color, tags, burned, last_used_at, error, created_at',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (category) query = query.eq('category', category);
    if (type) query = query.eq('type', type);
    if (burnedFilter !== 'all') query = query.eq('burned', burnedFilter);
    if (sp.tag) query = query.contains('tags', [sp.tag]);

    const { data: rows } = await query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assetRows: any[] = rows ?? [];

    initialAssets = await Promise.all(
      assetRows.map(async (row) => {
        let url: string | null = null;
        if (row.storage_path && row.status === 'ready') {
          const { data: signed } = await supabase.storage
            .from('visual-assets')
            .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
          url = signed?.signedUrl ?? null;
        }
        return { ...row, url } as AssetGridRow;
      }),
    );

    if (assetRows.length > 0) {
      const ids = assetRows.map((r) => r.id as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: usage } = await (supabase as any)
        .from('video_assets_used')
        .select('asset_id')
        .in('asset_id', ids);
      useCounts = ((usage ?? []) as { asset_id: string }[]).reduce<
        Record<string, number>
      >((acc, row) => {
        const k = row.asset_id;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    }
  }

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/40 mb-2">
              <Library size={16} />
              <span className="text-xs font-medium uppercase tracking-widest">
                Biblioteca
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white">Assets visuales</h1>
            <p className="text-sm text-white/50 mt-1">
              {project?.name
                ? `Proyecto: ${project.name}`
                : 'Sin proyecto activo — creá uno para empezar.'}
            </p>
          </div>
        </header>

        {projectId ? (
          <AssetsGrid
            initial={initialAssets}
            initialUseCounts={useCounts}
            projectId={projectId}
            initialFilters={{
              category: (sp.category ?? 'all') as 'all' | AssetCategory,
              type: (sp.type ?? 'all') as 'all' | AssetType,
              burned: (sp.burned ?? 'no') as 'no' | 'yes' | 'all',
              tag: sp.tag ?? '',
            }}
          />
        ) : (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-12 flex flex-col items-center text-center">
            <Library className="w-10 h-10 text-white/20 mb-4" />
            <p className="text-sm text-white/60 font-medium">
              No hay proyecto activo
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
