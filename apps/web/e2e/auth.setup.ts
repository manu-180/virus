import { createClient } from '@supabase/supabase-js';
import { test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';

export const AUTH_STATE = path.join(__dirname, '.auth/user.json');

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e@virus.test';
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'Virus_E2E_2026!';

function getProjectRef(supabaseUrl: string): string {
  const match = supabaseUrl.match(/https?:\/\/([^.]+)\./);
  return match?.[1] ?? 'localhost';
}

setup('create test user and authenticate', async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Idempotent: create test user only if not already present
  const { data: { users } } = await admin.auth.admin.listUsers();
  if (!users.find(u => u.email === TEST_EMAIL)) {
    const { error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
  }

  // Sign in via client API to get a real session
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`signIn failed: ${error?.message ?? 'no session'}`);

  // Mark onboarding complete so /dashboard is accessible
  await admin
    .from('profiles')
    .upsert({ id: data.user.id, onboarding_completed_at: new Date().toISOString() });

  // Set cookies that @supabase/ssr reads in the middleware
  // Cookie name: sb-{projectRef}-auth-token; value: raw session JSON (chunked at 3180 chars)
  const ref = getProjectRef(url);
  const sessionJson = JSON.stringify(data.session);
  const CHUNK = 3180;
  const cookieBase = {
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax' as const,
  };

  const cookies =
    sessionJson.length <= CHUNK
      ? [{ ...cookieBase, name: `sb-${ref}-auth-token`, value: sessionJson }]
      : Array.from({ length: Math.ceil(sessionJson.length / CHUNK) }, (_, i) => ({
          ...cookieBase,
          name: `sb-${ref}-auth-token.${i}`,
          value: sessionJson.slice(i * CHUNK, (i + 1) * CHUNK),
        }));

  await page.context().addCookies(cookies);

  // Verify auth is working
  await page.goto('/dashboard');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

  fs.mkdirSync(path.dirname(AUTH_STATE), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE });
});
