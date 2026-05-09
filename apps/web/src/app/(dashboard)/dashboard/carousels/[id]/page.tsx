import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CarouselDetailView } from '@/components/carousels/CarouselDetailView';

export const dynamic = 'force-dynamic';

export type CarouselProjectRow = {
  id: string;
  project_id: string;
  user_id: string;
  status: string; // 'pending'|'generating_slides'|'composing'|'generating_captions'|'ready'|'failed'
  brief: string; // JSON string with { topic, angle, tone, audience, slideCount, language, cta }
  style_preset: string;
  slide_count: number;
  error: string | null;
  inngest_run_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CarouselSlideRow = {
  id: string;
  carousel_id: string;
  user_id: string;
  idx: number;
  prompt: string;
  overlay_text: string | null;
  image_path: string | null;
  composed_path: string | null;
  status: string; // 'pending'|'generating'|'done'|'failed'
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type CarouselCaptionRow = {
  id: string;
  carousel_id: string;
  user_id: string;
  text: string;
  framework: string;
  variant_idx: number;
  selected: boolean;
  created_at: string;
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CarouselDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: project, error: projectError } = await supabase
    .from('carousel_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (projectError || !project) {
    notFound();
  }

  const { data: slides } = await supabase
    .from('carousel_slides')
    .select('*')
    .eq('carousel_id', id)
    .order('idx', { ascending: true });

  const { data: captions } = await supabase
    .from('carousel_captions')
    .select('*')
    .eq('carousel_id', id)
    .order('variant_idx', { ascending: true });

  const typedProject = project as unknown as CarouselProjectRow;

  return (
    <CarouselDetailView
      initialData={{
        project: typedProject,
        slides: (slides ?? []) as unknown as CarouselSlideRow[],
        captions: (captions ?? []) as unknown as CarouselCaptionRow[],
      }}
    />
  );
}
