/**
 * libre_albedrio client + `demos` queue ops (Vidriera-Video §8 wiring).
 *
 * The weekly orchestrator reads/updates the `demos` table that El Curador + El
 * Horno fill on Manuel's PC. This module owns that cross-project Supabase client
 * (service-role) and the small set of queue operations the orchestrator needs.
 *
 * Cross-project creds come from the worker env (Railway in prod, never the repo):
 *   LIBRE_ALBEDRIO_SUPABASE_URL, LIBRE_ALBEDRIO_SERVICE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PROMOTABLE_STATUSES, type DemoRow } from './vidriera-selection.js';

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing from worker env (Vidriera §8 wiring)`);
  return v;
}

let _client: SupabaseClient | null = null;

/** Supabase client bound to libre_albedrio (service-role) — reads/updates `demos`. */
export function libreAlbedrioClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    reqEnv('LIBRE_ALBEDRIO_SUPABASE_URL'),
    reqEnv('LIBRE_ALBEDRIO_SERVICE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return _client;
}

/** Test seam: inject a mock client, or null to restore the lazy production one. */
export function __setLibreAlbedrioClientForTests(client: SupabaseClient | null): void {
  _client = client;
}

const DEMO_COLUMNS =
  'id, slug, titulo, pitch, tipo_producto, status, url_deploy, caption_ig, created_at, promoted_at, ig_permalink, promo_error';

/**
 * FIFO pick (spec §3.1 / §4): the OLDEST built demo that has a live URL and
 * hasn't been promoted. Returns null when the queue is empty → colchón: the
 * orchestrator does NOT publish, it alerts (never repeats or invents a post).
 */
export async function selectNextDemo(client: SupabaseClient): Promise<DemoRow | null> {
  const { data, error } = await client
    .from('demos')
    .select(DEMO_COLUMNS)
    .in('status', [...PROMOTABLE_STATUSES])
    .not('url_deploy', 'is', null)
    .neq('url_deploy', '')
    .is('promoted_at', null)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(`selectNextDemo failed: ${error.message}`);
  return ((data ?? [])[0] as DemoRow | undefined) ?? null;
}

/** Mark a demo as promoted: stamp the time + permalink and clear any prior error. */
export async function markDemoPromoted(
  client: SupabaseClient,
  demoId: string,
  permalink: string | null,
): Promise<void> {
  const { error } = await client
    .from('demos')
    .update({ promoted_at: new Date().toISOString(), ig_permalink: permalink, promo_error: null })
    .eq('id', demoId);
  if (error) throw new Error(`markDemoPromoted failed: ${error.message}`);
}

/**
 * Record why a demo could NOT be promoted (a fail-safe tripped or a step threw),
 * WITHOUT setting promoted_at — so the demo stays in the queue and a later run
 * (after the cause is fixed) can retry it.
 */
export async function markDemoError(
  client: SupabaseClient,
  demoId: string,
  message: string,
): Promise<void> {
  const { error } = await client
    .from('demos')
    .update({ promo_error: message.slice(0, 1000) })
    .eq('id', demoId);
  if (error) throw new Error(`markDemoError failed: ${error.message}`);
}

export interface ActivityLogEntry {
  category: string;
  title: string;
  detail: string;
}

/**
 * Append a row to libre_albedrio's `activity_log` (Manuel's portfolio activity
 * feed). Best-effort: observability only, so a failure here never blocks a
 * publish — it is logged and swallowed.
 */
export async function logActivity(client: SupabaseClient, entry: ActivityLogEntry): Promise<void> {
  const { error } = await client.from('activity_log').insert({
    session_id: 'vidriera-auto',
    category: entry.category,
    title: entry.title,
    detail: entry.detail,
    project_slug: 'libre-albedrio',
  });
  if (error) {
    console.warn(`[vidriera] activity_log insert failed (non-fatal): ${error.message}`);
  }
}
