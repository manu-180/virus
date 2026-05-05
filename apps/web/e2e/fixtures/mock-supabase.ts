import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function createFreshTestUser(email: string, password: string) {
  const db = getAdminClient();
  const { data: existing } = await db.auth.admin.listUsers();
  const found = existing.users.find(u => u.email === email);
  if (found) {
    await db.auth.admin.deleteUser(found.id);
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createFreshTestUser: ${error.message}`);
  return data.user;
}

export async function deleteTestUser(email: string) {
  const db = getAdminClient();
  const { data: { users } } = await db.auth.admin.listUsers();
  const user = users.find(u => u.email === email);
  if (user) await db.auth.admin.deleteUser(user.id);
}

export async function setOnboardingCompleted(userId: string) {
  await getAdminClient()
    .from('profiles')
    .upsert({ id: userId, onboarding_completed_at: new Date().toISOString() });
}

export async function resetOnboarding(userId: string) {
  await getAdminClient()
    .from('profiles')
    .update({ onboarding_completed_at: null })
    .eq('id', userId);
}

export async function getTestUserId(email: string): Promise<string> {
  const { data: { users } } = await getAdminClient().auth.admin.listUsers();
  const user = users.find(u => u.email === email);
  if (!user) throw new Error(`User not found: ${email}`);
  return user.id;
}

// Creates a video row with status='ready' for scheduling tests
export async function createReadyVideo(userId: string, hookText = 'Test hook para E2E') {
  const { data, error } = await getAdminClient()
    .from('videos')
    .insert({ user_id: userId, status: 'ready', hook_text: hookText })
    .select('id')
    .single();
  if (error) throw new Error(`createReadyVideo: ${error.message}`);
  return data.id as string;
}

export async function getVideoStatus(videoId: string): Promise<string | null> {
  const { data } = await getAdminClient()
    .from('videos')
    .select('status')
    .eq('id', videoId)
    .single();
  return data?.status ?? null;
}

export async function deleteVideo(videoId: string) {
  await getAdminClient().from('videos').delete().eq('id', videoId);
}
