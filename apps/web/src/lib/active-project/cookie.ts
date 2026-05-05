'use server';

import { cookies } from 'next/headers';

import {
  ACTIVE_PROJECT_COOKIE_NAME,
  ACTIVE_PROJECT_COOKIE_MAX_AGE,
} from './constants';

/**
 * Reads the active project slug from the `active_project_slug` cookie.
 * Server-side only — uses next/headers cookies().
 */
export async function getActiveProjectSlug(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_PROJECT_COOKIE_NAME)?.value ?? null;
}

/**
 * Server action that persists the active project slug as a cookie.
 * maxAge: 1 year, path: /
 */
export async function setActiveProjectSlug(slug: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROJECT_COOKIE_NAME, slug, {
    maxAge: ACTIVE_PROJECT_COOKIE_MAX_AGE,
    path: '/',
    httpOnly: false, // must be readable by client-side JS as well
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
