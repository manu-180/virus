'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type { ProjectListItem } from '@/server/projects/types';

import {
  ACTIVE_PROJECT_COOKIE_NAME,
  ACTIVE_PROJECT_COOKIE_MAX_AGE,
} from './constants';

// ---------------------------------------------------------------------------
// Cookie helpers (client-side only — no next/headers import)
// ---------------------------------------------------------------------------

function readCookieSlug(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${ACTIVE_PROJECT_COOKIE_NAME}=`));
  if (!match) return null;
  const value = match.slice(`${ACTIVE_PROJECT_COOKIE_NAME}=`.length);
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function writeCookieSlug(slug: string): void {
  document.cookie = `${ACTIVE_PROJECT_COOKIE_NAME}=${encodeURIComponent(slug)}; path=/; max-age=${ACTIVE_PROJECT_COOKIE_MAX_AGE}; samesite=lax${process.env.NODE_ENV === 'production' ? '; secure' : ''}`;
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface ActiveProjectContextValue {
  activeProject: ProjectListItem | null;
  projects: ProjectListItem[];
  switchProject: (slug: string) => void;
  isLoading: boolean;
  error: Error | null;
}

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ActiveProjectProviderProps {
  children: ReactNode;
}

export function ActiveProjectProvider({ children }: ActiveProjectProviderProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch the project list once on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchProjects() {
      setError(null);
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
        const data: ProjectListItem[] = await res.json();

        if (cancelled) return;

        setProjects(data);

        // Resolve the active slug: prefer the cookie value if it matches a
        // known project, otherwise fall back to the first project in the list.
        const cookieSlug = readCookieSlug();
        const matched = cookieSlug
          ? data.find((p) => p.slug === cookieSlug) ?? null
          : null;

        const resolvedSlug = matched
          ? matched.slug
          : (data[0]?.slug ?? null);

        setActiveSlug(resolvedSlug);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load projects'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  const switchProject = useCallback(
    (slug: string) => {
      if (!projects.some((p) => p.slug === slug)) return; // ignore unknown slugs
      writeCookieSlug(slug);
      setActiveSlug(slug);
    },
    [projects],
  );

  const activeProject = projects.find((p) => p.slug === activeSlug) ?? null;

  return (
    <ActiveProjectContext.Provider
      value={{ activeProject, projects, switchProject, isLoading, error }}
    >
      {children}
    </ActiveProjectContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the currently active project, a function to switch it, a loading
 * flag, an error state, and the full project list.
 * Must be used inside `<ActiveProjectProvider>`.
 */
export function useActiveProject(): ActiveProjectContextValue {
  const ctx = useContext(ActiveProjectContext);

  if (ctx === null) {
    throw new Error(
      'useActiveProject must be used within an <ActiveProjectProvider>. ' +
        'Wrap your component tree with <ActiveProjectProvider>.',
    );
  }

  return ctx;
}
