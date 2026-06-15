/**
 * Vidriera-Video — demo selection rule (FASE HORNO §3.1 / §4).
 *
 * Pure eligibility logic for the weekly orchestrator: which `demos` row is a
 * valid candidate to promote as a Reel. Kept dependency-free so it is trivially
 * unit-tested; the actual FIFO query lives in libre-albedrio.ts and applies the
 * SAME criteria in SQL.
 */

/** A row of the libre_albedrio `demos` table (the subset the pipeline uses). */
export interface DemoRow {
  id: string;
  slug: string;
  titulo: string;
  pitch: string | null;
  tipo_producto: string | null;
  status: string;
  url_deploy: string | null;
  caption_ig: string | null;
  created_at: string;
  promoted_at: string | null;
  ig_permalink: string | null;
  promo_error: string | null;
}

/** Statuses that mean "the web is built and live enough to film". */
export const PROMOTABLE_STATUSES = ['listo', 'deployado'] as const;

/**
 * True iff this demo can be promoted now: a promotable status, a live URL to
 * film, and not already promoted. Mirrors the SQL filter in selectNextDemo().
 */
export function isPromotable(demo: DemoRow): boolean {
  const statusOk = (PROMOTABLE_STATUSES as readonly string[]).includes(demo.status);
  const hasLiveUrl = typeof demo.url_deploy === 'string' && demo.url_deploy.trim().length > 0;
  const notPromoted = demo.promoted_at == null;
  return statusOk && hasLiveUrl && notPromoted;
}
