import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { aggregateTrends } from '@virus/shared/viral';

const TREND_TTL_DAYS = 7;

export const detectTrends = inngest.createFunction(
  { id: 'detect-trends', retries: 1 },
  { cron: '0 */12 * * *' },
  async ({ step }) => {
    const trends = await step.run('fetch-trends', () =>
      aggregateTrends({ sinceDays: TREND_TTL_DAYS, topN: 50 })
    );

    const result = await step.run('upsert-trends', async () => {
      const db = getAdminClient();

      await db.from('trends').delete().lt('expires_at', new Date().toISOString());

      const rows = trends.map(t => ({
        source: t.source,
        title: t.title,
        url: t.url,
        score: t.score,
        keywords: t.keywords,
        category: t.category,
        detected_at: new Date(t.detectedAt).toISOString(),
        expires_at: new Date(Date.now() + TREND_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      }));

      const { error } = await db
        .from('trends')
        .upsert(rows, { onConflict: 'url' });

      if (error) throw new Error(`upsert_trends_failed: ${error.message}`);

      return { upserted: rows.length };
    });

    console.log({ fn: 'detect-trends', step: 'done', ...result });
    return result;
  }
);
