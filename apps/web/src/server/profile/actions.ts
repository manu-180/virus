'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  UpdateHandleSchema,
  BrandVoiceSchema,
  ScheduleConfigSchema,
} from '@/lib/zod/profile-schemas';
import type { Profile } from './types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string } };
type Result<T> = Ok<T> | Err;

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<Result<Profile>> {
  try {
    const user = await getUser();

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select()
      .eq('id', user.id)
      .single();

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }
    if (!data) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } };
    }

    return { ok: true, data: data as unknown as Profile };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = message === 'Unauthorized' ? 'UNAUTHORIZED' : 'UNKNOWN';
    return { ok: false, error: { code, message } };
  }
}

// ---------------------------------------------------------------------------
// updateHandle
// ---------------------------------------------------------------------------

export async function updateHandle(
  input: z.infer<typeof UpdateHandleSchema>,
): Promise<Result<Profile>> {
  try {
    const user = await getUser();

    const parsed = UpdateHandleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      };
    }

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', parsed.data.handle)
      .neq('id', user.id)
      .maybeSingle();

    if (existing) {
      return { ok: false, error: { code: 'HANDLE_TAKEN', message: 'Handle ya en uso' } };
    }

    const { data, error } = await admin
      .from('profiles')
      .update({ handle: parsed.data.handle })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: data as unknown as Profile };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = message === 'Unauthorized' ? 'UNAUTHORIZED' : 'UNKNOWN';
    return { ok: false, error: { code, message } };
  }
}

// ---------------------------------------------------------------------------
// updateAvatar
// ---------------------------------------------------------------------------

export async function updateAvatar(avatarUrl: string): Promise<Result<Profile>> {
  try {
    const user = await getUser();

    const parsed = z.string().min(1).max(500).safeParse(avatarUrl);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .update({ avatar_url: parsed.data })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: data as unknown as Profile };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = message === 'Unauthorized' ? 'UNAUTHORIZED' : 'UNKNOWN';
    return { ok: false, error: { code, message } };
  }
}

// ---------------------------------------------------------------------------
// saveBrandVoice
// ---------------------------------------------------------------------------

export async function saveBrandVoice(
  input: z.infer<typeof BrandVoiceSchema>,
): Promise<Result<Profile>> {
  try {
    const user = await getUser();

    const parsed = BrandVoiceSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .update({ brand_voice: parsed.data })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: data as unknown as Profile };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = message === 'Unauthorized' ? 'UNAUTHORIZED' : 'UNKNOWN';
    return { ok: false, error: { code, message } };
  }
}

// ---------------------------------------------------------------------------
// saveScheduleConfig
// ---------------------------------------------------------------------------

export async function saveScheduleConfig(
  input: z.infer<typeof ScheduleConfigSchema>,
): Promise<Result<Profile>> {
  try {
    const user = await getUser();

    const parsed = ScheduleConfigSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .update({ schedule_config: parsed.data })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: data as unknown as Profile };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = message === 'Unauthorized' ? 'UNAUTHORIZED' : 'UNKNOWN';
    return { ok: false, error: { code, message } };
  }
}

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

export async function deleteAccount(): Promise<Result<undefined>> {
  try {
    const user = await getUser();

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = message === 'Unauthorized' ? 'UNAUTHORIZED' : 'UNKNOWN';
    return { ok: false, error: { code, message } };
  }
}
