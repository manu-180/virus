import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import CarouselsList from '@/components/carousels/CarouselsList';

export const metadata = { title: 'Carruseles | Virus' };
export const dynamic = 'force-dynamic';

const THUMB_TTL = 3600; // 1h

const IN_PROGRESS_STATUSES = ['pending', 'generating_slides', 'composing', 'generating_captions'] as const;
const VALID_FILTERS = ['ready', 'failed', 'in-progress'] as const;
type FilterValue = (typeof VALID_FILTERS)[number];

export type CarouselListItem = {
  id: string;
  status: string;
  brief: { topic: string; [key: string]: unknown };
  slide_count: number;
  created_at: string;
  project_id: string;
  thumb_url: string | null;
};

interface SearchParams {
  status?: string;
}

export default async function CarouselsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const filterValue = VALID_FILTERS.includes(sp.status as FilterValue)
    ? (sp.status as FilterValue)
    : null;

  let query = supabase
    .from('carousel_projects')
    .select('id, status, brief, slide_count, created_at, project_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (filterValue === 'ready') query = query.eq('status', 'ready');
  else if (filterValue === 'failed') query = query.eq('status', 'failed');
  else if (filterValue === 'in-progress') query = query.in('status', [...IN_PROGRESS_STATUSES]);

  const { data: projects } = await query;

  if (!projects || projects.length === 0) {
    return <CarouselsList items={[]} statusFilter={filterValue} />;
  }

  const ids = projects.map((p) => p.id);
  const { data: firstSlides } = await supabase
    .from('carousel_slides')
    .select('carousel_id, composed_path')
    .in('carousel_id', ids)
    .eq('idx', 0);

  const thumbPathMap: Record<string, string | null> = {};
  for (const slide of firstSlides ?? []) {
    if (slide.composed_path) thumbPathMap[slide.carousel_id] = slide.composed_path;
  }

  const pathsToSign = [...new Set(Object.values(thumbPathMap).filter(Boolean) as string[])];
  const signedUrlMap: Record<string, string> = {};

  if (pathsToSign.length > 0) {
    const admin = createAdminClient();
    const results = await Promise.allSettled(
      pathsToSign.map(async (path) => {
        const { data, error } = await admin.storage
          .from('carousels')
          .createSignedUrl(path, THUMB_TTL);
        if (error || !data?.signedUrl) throw new Error(error?.message ?? 'no url');
        return [path, data.signedUrl] as [string, string];
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [path, url] = r.value;
        signedUrlMap[path] = url;
      }
    }
  }

  const items: CarouselListItem[] = projects.map((p) => {
    const thumbPath = thumbPathMap[p.id] ?? null;
    let brief: { topic: string; [key: string]: unknown } = { topic: 'Sin título' };
    try {
      const parsed = JSON.parse(p.brief as string);
      if (parsed && typeof parsed === 'object') brief = parsed;
    } catch {}
    return {
      id: p.id,
      status: p.status as string,
      brief,
      slide_count: p.slide_count as number,
      created_at: p.created_at as string,
      project_id: p.project_id as string,
      thumb_url: thumbPath ? (signedUrlMap[thumbPath] ?? null) : null,
    };
  });

  return <CarouselsList items={items} statusFilter={filterValue} />;
}
