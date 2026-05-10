import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify ownership
  const { data: carousel } = await supabase
    .from('carousel_projects')
    .select('id, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (!carousel) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Aggregate cost using the RPC added in migration 0023
  const { data: rows } = await supabase.rpc('get_carousel_cost', { p_carousel_id: id });

  const breakdown = (rows ?? []) as { service: string; total_usd: number; record_count: number }[];

  const totalUsd = breakdown.reduce((sum, r) => sum + Number(r.total_usd), 0);
  const byProvider: Record<string, number> = {};
  for (const r of breakdown) {
    byProvider[r.service] = Math.round(Number(r.total_usd) * 10_000) / 10_000;
  }

  const createdAt = new Date(carousel.created_at).getTime();
  const updatedAt = new Date(carousel.updated_at).getTime();

  return NextResponse.json({
    totalUsd: Math.round(totalUsd * 10_000) / 10_000,
    totalCents: Math.round(totalUsd * 100),
    byProvider,
    recordCount: breakdown.reduce((s, r) => s + Number(r.record_count), 0),
    generationTimeMs: Math.max(0, updatedAt - createdAt),
  });
}
