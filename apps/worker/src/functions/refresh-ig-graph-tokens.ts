/**
 * refresh-ig-graph-tokens — Daily cron that refreshes Meta long-lived tokens.
 *
 * Meta page access tokens generated from long-lived user tokens technically
 * don't expire, BUT:
 *   - Meta will invalidate them if the user revokes the app
 *   - The underlying user token expires every 60 days
 *   - We track `graph_token_expires_at` per account
 *
 * Strategy: every day at 03:00 UTC, find accounts whose token is < 14 days
 * from expiry (or has no expiry recorded). For each, call /debug_token to
 * verify validity; mark `challenge` if invalid so the UI prompts a re-connect.
 *
 * NOTE: a fresh long-lived user token cannot be obtained without a new OAuth
 * round-trip (Meta intentionally requires user interaction). So this job
 * doesn't actually refresh — it _validates_ and warns. Real renewal happens
 * when the user clicks "Reconnect" in /dashboard/settings/instagram.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { buildAppAccessToken, debugToken } from '../lib/instagram-graph.js';

interface AccountWithToken {
  id: string;
  ig_username: string;
  graph_token_expires_at: string | null;
  status: string;
}

interface TokenRpcRow {
  access_token: string;
  graph_user_id: string;
  graph_page_id: string;
  ig_username: string;
  expires_at: string | null;
}

export const refreshIgGraphTokens = inngest.createFunction(
  {
    id: 'refresh-ig-graph-tokens',
    name: 'Validate Instagram Graph API tokens',
    retries: 1,
  },
  { cron: '0 3 * * *' }, // daily at 03:00 UTC
  async ({ step, logger }) => {
    const appId = process.env['META_APP_ID'];
    const appSecret = process.env['META_APP_SECRET'];
    if (!appId || !appSecret) {
      logger.warn('refresh.skipped_no_meta_app');
      return { skipped: true, reason: 'META_APP_ID / META_APP_SECRET not set' };
    }
    const appToken = buildAppAccessToken(appId, appSecret);
    const supabase = getAdminClient();

    // Pull all active graph_api accounts.
    const candidates = await step.run('list-candidates', async () => {
      const { data, error } = await supabase
        .from('ig_accounts')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, ig_username, graph_token_expires_at, status' as any)
        .eq('auth_type' as never, 'graph_api')
        .neq('status' as never, 'disabled')
        .is('deleted_at' as never, null);
      if (error) {
        logger.error('refresh.list_failed', { error: error.message });
        return [] as AccountWithToken[];
      }
      return (data ?? []) as unknown as AccountWithToken[];
    });

    let validated = 0;
    let flagged = 0;

    for (const acct of candidates) {
      const result = await step.run(`validate-${acct.id}`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rpc = await (supabase.rpc as any)('ig_account_get_graph_token', {
          p_account_id: acct.id,
        });
        const rows = (rpc.data ?? []) as TokenRpcRow[];
        if (rpc.error || rows.length === 0) {
          return { ok: false as const, reason: rpc.error?.message ?? 'no-token' };
        }
        try {
          const info = await debugToken(rows[0]!.access_token, appToken);
          if (!info.isValid) {
            return { ok: false as const, reason: 'token_invalid' };
          }
          // Update expires_at if Meta reported one
          if (info.expiresAt) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('ig_accounts') as any)
              .update({ graph_token_expires_at: info.expiresAt.toISOString() })
              .eq('id', acct.id);
          }
          return { ok: true as const };
        } catch (err) {
          return { ok: false as const, reason: err instanceof Error ? err.message : 'debug_failed' };
        }
      });

      if (result.ok) {
        validated += 1;
      } else {
        flagged += 1;
        await step.run(`flag-${acct.id}`, async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('ig_accounts') as any)
            .update({
              status: 'challenge',
              last_error: `Token validation failed: ${result.reason}. Re-connect this account.`,
            })
            .eq('id', acct.id);
        });
      }
    }

    logger.info('refresh.done', { total: candidates.length, validated, flagged });
    return { total: candidates.length, validated, flagged };
  },
);
