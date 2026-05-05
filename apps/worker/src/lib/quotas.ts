import { getAdminClient } from './supabase.js';

export const LIMITS_PER_USER = {
  anthropic:      { perDayUsd: 5,       perMonthUsd: 30 },
  elevenlabs:     { perDayChars: 5_000, perMonthChars: 100_000 },
  assemblyai:     { perDayMinutes: 30,  perMonthMinutes: 600 },
  remotionLambda: { perDayRenders: 20,  perMonthRenders: 200 },
} as const;

export type QuotaService = keyof typeof LIMITS_PER_USER;

const DB_SERVICE: Record<QuotaService, string> = {
  anthropic:      'anthropic',
  elevenlabs:     'elevenlabs',
  assemblyai:     'assemblyai',
  remotionLambda: 'remotion_lambda',
};

const DAY_MS   = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from: (t: string) => any };

async function sumField(
  userId: string,
  service: string,
  field: 'cost_usd' | 'units',
  sinceMs: number,
): Promise<number> {
  const db = getAdminClient() as unknown as AnyDb;
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { data, error } = await db
    .from('usage_records')
    .select(field)
    .eq('user_id', userId)
    .eq('service', service)
    .gte('created_at', since);
  if (error) throw new Error(`quota query: ${(error as { message: string }).message}`);
  return ((data as Record<string, unknown>[]) ?? []).reduce(
    (s, r) => s + Number(r[field]),
    0,
  );
}

async function countRows(userId: string, service: string, sinceMs: number): Promise<number> {
  const db = getAdminClient() as unknown as AnyDb;
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { count, error } = await db
    .from('usage_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('service', service)
    .gte('created_at', since);
  if (error) throw new Error(`quota count: ${(error as { message: string }).message}`);
  return (count as number | null) ?? 0;
}

export async function checkQuota(input: {
  userId: string;
  service: QuotaService;
  estimatedCostUsd?: number;
  estimatedUnits?: number;
}): Promise<{ allowed: boolean; reason?: string; usedThisMonth: number }> {
  const { userId, service, estimatedCostUsd = 0, estimatedUnits = 0 } = input;
  const dbSvc = DB_SERVICE[service];

  switch (service) {
    case 'anthropic': {
      const lim = LIMITS_PER_USER.anthropic;
      const [dayUsd, monthUsd] = await Promise.all([
        sumField(userId, dbSvc, 'cost_usd', DAY_MS),
        sumField(userId, dbSvc, 'cost_usd', MONTH_MS),
      ]);
      if (dayUsd + estimatedCostUsd > lim.perDayUsd)
        return { allowed: false, reason: `Anthropic daily cap $${lim.perDayUsd} reached`, usedThisMonth: monthUsd };
      if (monthUsd + estimatedCostUsd > lim.perMonthUsd)
        return { allowed: false, reason: `Anthropic monthly cap $${lim.perMonthUsd} reached`, usedThisMonth: monthUsd };
      return { allowed: true, usedThisMonth: monthUsd };
    }

    case 'elevenlabs': {
      const lim = LIMITS_PER_USER.elevenlabs;
      const [dayChars, monthChars] = await Promise.all([
        sumField(userId, dbSvc, 'units', DAY_MS),
        sumField(userId, dbSvc, 'units', MONTH_MS),
      ]);
      if (dayChars + estimatedUnits > lim.perDayChars)
        return { allowed: false, reason: `ElevenLabs daily cap ${lim.perDayChars} chars reached`, usedThisMonth: monthChars };
      if (monthChars + estimatedUnits > lim.perMonthChars)
        return { allowed: false, reason: `ElevenLabs monthly cap ${lim.perMonthChars} chars reached`, usedThisMonth: monthChars };
      return { allowed: true, usedThisMonth: monthChars };
    }

    case 'assemblyai': {
      const lim = LIMITS_PER_USER.assemblyai;
      const [daySec, monthSec] = await Promise.all([
        sumField(userId, dbSvc, 'units', DAY_MS),
        sumField(userId, dbSvc, 'units', MONTH_MS),
      ]);
      // estimatedUnits = seconds; limits are in minutes
      if (daySec / 60 + estimatedUnits / 60 > lim.perDayMinutes)
        return { allowed: false, reason: `AssemblyAI daily cap ${lim.perDayMinutes} min reached`, usedThisMonth: monthSec };
      if (monthSec / 60 + estimatedUnits / 60 > lim.perMonthMinutes)
        return { allowed: false, reason: `AssemblyAI monthly cap ${lim.perMonthMinutes} min reached`, usedThisMonth: monthSec };
      return { allowed: true, usedThisMonth: monthSec };
    }

    case 'remotionLambda': {
      const lim = LIMITS_PER_USER.remotionLambda;
      const [dayCount, monthCount] = await Promise.all([
        countRows(userId, dbSvc, DAY_MS),
        countRows(userId, dbSvc, MONTH_MS),
      ]);
      if (dayCount >= lim.perDayRenders)
        return { allowed: false, reason: `Remotion daily cap ${lim.perDayRenders} renders reached`, usedThisMonth: monthCount };
      if (monthCount >= lim.perMonthRenders)
        return { allowed: false, reason: `Remotion monthly cap ${lim.perMonthRenders} renders reached`, usedThisMonth: monthCount };
      return { allowed: true, usedThisMonth: monthCount };
    }
  }
}

export async function recordUsage(input: {
  userId: string;
  service: QuotaService;
  units: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { userId, service, units, costUsd, metadata } = input;
  const db = getAdminClient() as unknown as AnyDb;
  const { error } = await db.from('usage_records').insert({
    user_id: userId,
    service: DB_SERVICE[service],
    units,
    cost_usd: costUsd,
    metadata: metadata ?? null,
  });
  if (error) throw new Error(`recordUsage: ${(error as { message: string }).message}`);
}

export async function withQuota<T>(
  service: QuotaService,
  userId: string,
  estimatedCost: number,
  fn: () => Promise<{ result: T; actualCost: number; actualUnits: number }>,
): Promise<T> {
  const quota = await checkQuota({ userId, service, estimatedCostUsd: estimatedCost });
  if (!quota.allowed) {
    throw new Error(`[quota] ${service}: ${quota.reason}`);
  }
  const { result, actualCost, actualUnits } = await fn();
  await recordUsage({ userId, service, units: actualUnits, costUsd: actualCost });
  return result;
}
