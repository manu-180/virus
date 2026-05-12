/**
 * POST /api/carousels/[id]/publish-ig
 *   Body: { igAccountId?: string }
 *
 * - Validates the carousel is `ready` and owned by the user.
 * - Resolves the IG account: explicit body param, else the project's single
 *   active account. Errors out clearly when no eligible account exists.
 * - Reads the selected caption (falls back to variant 0).
 * - Creates an `ig_publications` row in status `queued`.
 * - Dispatches a `virus/carousel.publish.requested` event for the worker.
 * - Returns the publication row so the UI can subscribe to it.
 *
 * GET /api/carousels/[id]/publish-ig
 *   Returns the latest publication row for this carousel (or 404).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';

// The generated Database types in @virus/db are out-of-date relative to
// migrations 0028-0030 (ig_accounts, ig_publications). Until the types are
// regenerated, we access these tables through the untyped escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

interface CarouselRow {
  id: string;
  user_id: string;
  project_id: string;
  status: string;
}

interface CaptionRow {
  text: string;
  variant_idx: number;
  selected: boolean;
}

interface IgAccountSummary {
  id: string;
  ig_username: string;
  status: string;
  display_name: string | null;
  post_count_24h: number;
  daily_post_limit: number;
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

function pickCaption(captions: CaptionRow[]): string | null {
  if (!captions || captions.length === 0) return null;
  const selected = captions.find((c) => c.selected);
  if (selected) return selected.text;
  const sorted = [...captions].sort((a, b) => a.variant_idx - b.variant_idx);
  return sorted[0]?.text ?? null;
}

// ---------------------------------------------------------------------------
// POST — trigger publish
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // Parse optional body
    let bodyJson: { igAccountId?: string } = {};
    try {
      const text = await req.text();
      if (text) bodyJson = JSON.parse(text);
    } catch {
      // Empty body is fine — we'll auto-pick the account
    }

    const supabase = await createClient();

    // ── Load carousel (RLS-scoped) ────────────────────────────────────────
    const { data: project, error: projectErr } = await supabase
      .from('carousel_projects')
      .select('id, user_id, project_id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single<CarouselRow>();

    if (projectErr || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    if (project.status !== 'ready') {
      return NextResponse.json(
        { error: 'carousel_not_ready', status: project.status },
        { status: 409 },
      );
    }

    // ── Load caption (must have one to publish) ───────────────────────────
    const { data: captions, error: capErr } = await supabase
      .from('carousel_captions')
      .select('text, variant_idx, selected')
      .eq('carousel_id', id)
      .order('variant_idx', { ascending: true });

    if (capErr) {
      console.error('[publish-ig] caption query failed:', capErr);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    const caption = pickCaption(captions ?? []);
    if (!caption) {
      return NextResponse.json({ error: 'no_caption_available' }, { status: 409 });
    }

    // ── Resolve target IG account ─────────────────────────────────────────
    const explicitId = typeof bodyJson.igAccountId === 'string' ? bodyJson.igAccountId : null;

    let accountQuery = (supabase as AnyTable)
      .from('ig_accounts')
      .select('id, ig_username, status, display_name, post_count_24h, daily_post_limit')
      .eq('user_id', user.id)
      .eq('project_id', project.project_id)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (explicitId) {
      accountQuery = accountQuery.eq('id', explicitId);
    }

    const { data: accountsRaw, error: acctErr } = await accountQuery.limit(2);
    const accounts = (accountsRaw ?? []) as IgAccountSummary[];

    if (acctErr) {
      console.error('[publish-ig] account query failed:', acctErr);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    if (accounts.length === 0) {
      return NextResponse.json(
        {
          error: 'no_active_ig_account',
          message:
            'Conectá una cuenta de Instagram para este proyecto antes de publicar (apps/ig-publisher onboard CLI).',
        },
        { status: 409 },
      );
    }

    // If explicit id wasn't given and we have more than one, refuse — the
    // caller has to choose. (Today there's typically only one per project.)
    if (!explicitId && accounts.length > 1) {
      return NextResponse.json(
        {
          error: 'multiple_accounts_choose_one',
          accounts,
        },
        { status: 409 },
      );
    }

    const account = accounts[0]!;
    if (account.post_count_24h >= account.daily_post_limit) {
      return NextResponse.json(
        {
          error: 'daily_post_limit_reached',
          message: `Llegaste al límite diario (${account.daily_post_limit} posts) para @${account.ig_username}.`,
        },
        { status: 429 },
      );
    }

    // ── Reject if there's already an in-flight publication for this carousel + account ──
    const { data: existing } = await (supabase as AnyTable)
      .from('ig_publications')
      .select('id, status')
      .eq('carousel_id', id)
      .eq('ig_account_id', account.id)
      .in('status', ['queued', 'publishing'])
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          error: 'publish_already_in_flight',
          publication: existing[0],
        },
        { status: 409 },
      );
    }

    // ── Insert publication row (admin client — RLS would refuse user_id default trigger anyway) ──
    const admin = createAdminClient();
    const { data: publication, error: insertErr } = await (admin as AnyTable)
      .from('ig_publications')
      .insert({
        carousel_id: id,
        ig_account_id: account.id,
        user_id: user.id,
        caption,
        first_comment: null,
        status: 'queued',
      })
      .select('id, carousel_id, ig_account_id, status, caption, created_at')
      .single();

    if (insertErr || !publication) {
      console.error('[publish-ig] insert failed:', insertErr);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    // ── Dispatch Inngest event ────────────────────────────────────────────
    try {
      await inngest.send({
        name: 'virus/carousel.publish.requested',
        data: {
          publicationId: publication.id,
          carouselId: id,
          igAccountId: account.id,
          userId: user.id,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } catch (sendErr) {
      console.error('[publish-ig] inngest.send failed:', sendErr);
      // Roll the row to failed so the user sees the error in the UI.
      await (admin as AnyTable)
        .from('ig_publications')
        .update({
          status: 'failed',
          error: { code: 'dispatch_failed', message: 'Could not enqueue publish event.' },
        })
        .eq('id', publication.id);
      return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 });
    }

    return NextResponse.json({
      publication,
      account: {
        id: account.id,
        ig_username: account.ig_username,
        display_name: account.display_name,
      },
    });
  } catch (err) {
    console.error('[POST /api/carousels/[id]/publish-ig]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET — latest publication for this carousel
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = await createClient();

    // Confirm ownership of the carousel via RLS
    const { data: project } = await supabase
      .from('carousel_projects')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { data: publications, error } = await (supabase as AnyTable)
      .from('ig_publications')
      .select(
        'id, ig_account_id, status, ig_media_id, ig_permalink, published_at, attempts, last_attempt_at, error, created_at, updated_at',
      )
      .eq('carousel_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('[GET publish-ig] error:', error);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    return NextResponse.json({ publications: publications ?? [] });
  } catch (err) {
    console.error('[GET /api/carousels/[id]/publish-ig]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
