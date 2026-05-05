import { checkQuota, recordUsage, LIMITS_PER_USER } from './limits';

export async function withQuota<T>(
  service: keyof typeof LIMITS_PER_USER,
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
