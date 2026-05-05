import { createClient } from '@supabase/supabase-js';
import { test as teardown } from '@playwright/test';
import { TEST_EMAIL } from './auth.setup';

teardown('delete test user', async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: { users } } = await admin.auth.admin.listUsers();
  const user = users.find(u => u.email === TEST_EMAIL);
  if (user) {
    await admin.auth.admin.deleteUser(user.id);
  }
});
