# Project Detail Page (T4-P10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/projects/[slug]` page — la pantalla principal de trabajo diario donde el usuario clickea "Generar video", ve el progreso en vivo, descarga el MP4 y copia el caption.

**Architecture:** Server-rendered page with multiple Suspense boundaries. A thin client wrapper mounts a Supabase Realtime subscription to the `videos` table (filtered by project) and propagates status updates to child client components. The generate button is a client component with an optimistic state machine.

**Tech Stack:** Next.js 15 App Router · Supabase SSR + Realtime · shadcn/ui · Framer Motion · Tailwind CSS v4 · sonner toasts · TypeScript

---

## Context & Constraints

- No test framework is configured. Verification is done with `npm run typecheck` (from `apps/web/`) and manual E2E.
- Dark theme: `bg-[#111318]` background, `#C8FF57` lime accent.
- Toast: `sonner` (`import { toast } from 'sonner'`).
- Framer Motion: `framer-motion` v12 (use `motion` from `'framer-motion'`).
- Server queries use `createAdminClient()`. Browser hooks use `createClient()` from `@/lib/supabase/client`.
- Server actions follow the `Result<T>` pattern: `{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }`.
- `fetchProjectFull(slug, userId)` returns `ProjectFull` — already exists, no modification needed.
- `getSignedUrl` is `server-only` — must go through an API route for client-side use.
- The `project:{slug}` realtime channel is implemented as a Supabase `postgres_changes` subscription on the `videos` table filtered by `project_id`.

## File Map

```
CREATED
apps/web/src/app/(dashboard)/projects/[slug]/page.tsx
apps/web/src/app/(dashboard)/projects/[slug]/loading.tsx
apps/web/src/app/(dashboard)/projects/[slug]/_components/header.tsx
apps/web/src/app/(dashboard)/projects/[slug]/_components/generate-button.tsx
apps/web/src/app/(dashboard)/projects/[slug]/_components/generation-progress.tsx
apps/web/src/app/(dashboard)/projects/[slug]/_components/video-history.tsx
apps/web/src/app/(dashboard)/projects/[slug]/_components/video-row.tsx
apps/web/src/app/(dashboard)/projects/[slug]/_components/caption-modal.tsx
apps/web/src/app/(dashboard)/projects/[slug]/_components/files-panel.tsx
apps/web/src/app/(dashboard)/projects/[slug]/_components/anti-repeat-summary.tsx
apps/web/src/app/api/videos/[id]/signed-url/route.ts
apps/web/src/hooks/use-project-realtime.ts

MODIFIED
apps/web/src/server/videos/types.ts         (add ProjectVideo)
apps/web/src/server/videos/queries.ts       (add fetchProjectVideos)
apps/web/src/server/videos/actions.ts       (add markVideoPublished, getProjectVideos)
```

---

## Task 1: Data Layer — ProjectVideo type + fetchProjectVideos

**Files:**
- Modify: `apps/web/src/server/videos/types.ts`
- Modify: `apps/web/src/server/videos/queries.ts`
- Modify: `apps/web/src/server/videos/actions.ts`

### Why this first
Every UI component depends on the video data shape. Locking it in before touching any component prevents cascading type errors.

- [ ] **Step 1.1: Add `ProjectVideo` type to `server/videos/types.ts`**

Append after the existing `CalendarDay` interface:

```typescript
export interface ProjectVideo {
  id: string;
  projectId: string;
  userId: string;
  status: 'pending' | 'scripting' | 'audio' | 'captions' | 'rendering' | 'ready' | 'published' | 'error';
  hookText: string | null;       // from video_ideas.hook_text
  format: string | null;         // from video_ideas.format (may not exist on all rows)
  durationSec: number | null;    // from videos.duration_sec (may be null)
  videoUrl: string | null;
  instagramCaption: string | null;  // from videos.instagram_caption
  tiktokCaption: string | null;     // from videos.tiktok_caption
  youtubeCaption: string | null;    // from videos.youtube_caption
  publishedAt: string | null;
  publishedUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
}
```

- [ ] **Step 1.2: Add `fetchProjectVideos` to `server/videos/queries.ts`**

Append after `fetchReadyVideos`:

```typescript
export async function fetchProjectVideos(
  projectId: string,
  userId: string,
): Promise<ProjectVideo[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('videos')
    .select(`
      id,
      project_id,
      user_id,
      status,
      video_url,
      duration_sec,
      instagram_caption,
      tiktok_caption,
      youtube_caption,
      published_at,
      published_url,
      error_message,
      created_at,
      video_ideas ( hook_text, format )
    `)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((row) => {
    const idea = row.video_ideas as { hook_text: string; format: string } | null;
    return {
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      status: row.status as ProjectVideo['status'],
      hookText: idea?.hook_text ?? null,
      format: idea?.format ?? null,
      durationSec: (row as any).duration_sec ?? null,
      videoUrl: row.video_url ?? null,
      instagramCaption: (row as any).instagram_caption ?? null,
      tiktokCaption: (row as any).tiktok_caption ?? null,
      youtubeCaption: (row as any).youtube_caption ?? null,
      publishedAt: row.published_at ?? null,
      publishedUrl: (row as any).published_url ?? null,
      errorMessage: (row as any).error_message ?? null,
      createdAt: row.created_at,
    };
  });
}
```

> **Note:** Fields like `duration_sec`, `instagram_caption`, `tiktok_caption`, `youtube_caption`, `published_url`, `error_message` may not be in the generated DB types yet — the `(row as any)` casts handle this gracefully until the DB types are regenerated. If the migration for these columns hasn't run, they'll be null.

- [ ] **Step 1.3: Add `markVideoPublished` and `getProjectVideos` to `server/videos/actions.ts`**

Append at the end of the file:

```typescript
// ---------------------------------------------------------------------------
// markVideoPublished
// ---------------------------------------------------------------------------

export async function markVideoPublished(
  videoId: string,
  publishedUrl: string,
): Promise<Result<void>> {
  if (!videoId) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'videoId is required' } };
  }
  if (!publishedUrl || !publishedUrl.startsWith('http')) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'publishedUrl must be a valid URL' } };
  }

  try {
    const user = await getUser();
    const admin = createAdminClient();

    const { data: video, error: fetchError } = await admin
      .from('videos')
      .select('id, user_id')
      .eq('id', videoId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !video) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Video not found' } };
    }
    if (video.user_id !== user.id) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const { error: updateError } = await admin
      .from('videos')
      .update({
        published_at: new Date().toISOString(),
        published_url: publishedUrl,
        status: 'published',
      } as any)
      .eq('id', videoId);

    if (updateError) {
      return { ok: false, error: { code: 'DB_ERROR', message: updateError.message } };
    }

    return { ok: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// getProjectVideos
// ---------------------------------------------------------------------------

export async function getProjectVideos(projectId: string): Promise<Result<ProjectVideo[]>> {
  if (!projectId) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId is required' } };
  }
  try {
    const user = await getUser();
    const data = await fetchProjectVideos(projectId, user.id);
    return { ok: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}
```

Also add the missing import at the top of `actions.ts`:

```typescript
import { fetchScheduledVideos, fetchReadyVideos, fetchProjectVideos } from './queries';
import type { ScheduledVideo, ProjectVideo } from './types';
```

- [ ] **Step 1.4: Verify types compile**

```bash
cd apps/web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 1.5: Commit**

```bash
git add apps/web/src/server/videos/types.ts apps/web/src/server/videos/queries.ts apps/web/src/server/videos/actions.ts
git commit -m "feat(videos): add ProjectVideo type, fetchProjectVideos, markVideoPublished"
```

---

## Task 2: Signed URL API Route

Client components need to trigger MP4 downloads. `getSignedUrl` is `server-only`, so it must go through an API route.

**Files:**
- Create: `apps/web/src/app/api/videos/[id]/signed-url/route.ts`

- [ ] **Step 2.1: Create the route**

```typescript
// apps/web/src/app/api/videos/[id]/signed-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl } from '@/lib/storage/signed-urls';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: videoId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: video, error } = await admin
    .from('videos')
    .select('id, user_id, video_url')
    .eq('id', videoId)
    .is('deleted_at', null)
    .single();

  if (error || !video) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (video.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!video.video_url) return NextResponse.json({ error: 'No video yet' }, { status: 404 });

  // video_url stored as storage path, e.g. "userId/videoId.mp4"
  const signedUrl = await getSignedUrl({ bucket: 'videos', path: video.video_url });

  return NextResponse.json({ url: signedUrl });
}
```

- [ ] **Step 2.2: Verify**

```bash
cd apps/web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 2.3: Commit**

```bash
git add apps/web/src/app/api/videos/
git commit -m "feat(api): add /api/videos/[id]/signed-url GET route"
```

---

## Task 3: Realtime Hook

**Files:**
- Create: `apps/web/src/hooks/use-project-realtime.ts`

The hook subscribes to Supabase Realtime `postgres_changes` on the `videos` table filtered by `project_id`. When a change arrives, it calls `onEvent` with the updated video ID and new status so the parent can trigger a refetch.

- [ ] **Step 3.1: Create the hook**

```typescript
// apps/web/src/hooks/use-project-realtime.ts
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface RealtimeVideoEvent {
  videoId: string;
  status: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
}

export function useProjectRealtime(
  projectId: string | undefined,
  onEvent: (event: RealtimeVideoEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!projectId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`project:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'videos',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const record = (payload.new ?? payload.old) as { id?: string; status?: string } | null;
          if (!record?.id) return;
          onEventRef.current({
            videoId: record.id,
            status: record.status ?? '',
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);
}
```

- [ ] **Step 3.2: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 3.3: Commit**

```bash
git add apps/web/src/hooks/use-project-realtime.ts
git commit -m "feat(realtime): add useProjectRealtime hook for live video status updates"
```

---

## Task 4: Page Scaffold + Loading Skeleton

**Files:**
- Create: `apps/web/src/app/(dashboard)/projects/[slug]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[slug]/loading.tsx`

The page is a server component that fetches `ProjectFull` and passes it down. Suspense is used per-section so the generate button is always visible first (CLS minimum).

- [ ] **Step 4.1: Create `loading.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectDetailLoading() {
  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-3 rounded-full" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-64" />

      {/* Generate button skeleton */}
      <Skeleton className="h-40 w-full rounded-2xl" />

      {/* History skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Create `page.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/page.tsx
import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProjectFull } from '@/server/projects/queries';
import Header from './_components/header';
import GenerateButton from './_components/generate-button';
import GenerationProgress from './_components/generation-progress';
import VideoHistory from './_components/video-history';
import FilesPanel from './_components/files-panel';
import AntiRepeatSummary from './_components/anti-repeat-summary';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ autogenerate?: string }>;
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { autogenerate } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  let project;
  try {
    project = await fetchProjectFull(slug, user.id);
  } catch {
    notFound();
  }

  const configOk =
    project.patterns !== null &&
    project.brand !== null;

  return (
    <div className="min-h-screen bg-[#111318] px-4 py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header — always visible immediately */}
        <Header project={project} />

        {/* Two-column layout on desktop */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="space-y-6">
            {/* Generate button — hero, always rendered first */}
            <GenerateButton
              projectId={project.id}
              projectSlug={slug}
              configOk={configOk}
              autoGenerate={autogenerate === '1'}
            />

            {/* History */}
            <Suspense fallback={
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            }>
              <VideoHistory projectId={project.id} projectSlug={slug} />
            </Suspense>

            {/* Anti-repeat summary */}
            <AntiRepeatSummary projectId={project.id} />
          </div>

          {/* Files panel — sidebar on desktop, section below on mobile */}
          <div>
            <FilesPanel project={project} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.3: Verify**

```bash
cd apps/web && npm run typecheck
```

Expected: zero errors (component files missing will error — create stub files next, or create all components first).

> **Tip:** Create stub exports for each missing `_components/*.tsx` file so typecheck passes now:
> ```typescript
> // stub — replace per task
> export default function ComponentName() { return null; }
> ```

- [ ] **Step 4.4: Create stubs for all 8 components**

Create these files with minimal default exports so the page compiles:
- `_components/header.tsx` — `export default function Header() { return null; }`
- `_components/generate-button.tsx` — `'use client'; export default function GenerateButton() { return null; }`
- `_components/generation-progress.tsx` — `'use client'; export default function GenerationProgress() { return null; }`
- `_components/video-history.tsx` — `export default function VideoHistory() { return null; }`
- `_components/video-row.tsx` — `'use client'; export default function VideoRow() { return null; }`
- `_components/caption-modal.tsx` — `'use client'; export default function CaptionModal() { return null; }`
- `_components/files-panel.tsx` — `'use client'; export default function FilesPanel() { return null; }`
- `_components/anti-repeat-summary.tsx` — `'use client'; export default function AntiRepeatSummary() { return null; }`

- [ ] **Step 4.5: Verify after stubs**

```bash
cd apps/web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4.6: Commit**

```bash
git add apps/web/src/app/(dashboard)/projects/
git commit -m "feat(project-detail): scaffold page + loading skeleton + component stubs"
```

---

## Task 5: Header Component

**Files:**
- Modify: `apps/web/src/app/(dashboard)/projects/[slug]/_components/header.tsx`

Shows: color dot, project name, niche, video count, ROAS average (placeholder if not in data). "Configurar" button opens a simple redirect to `/projects/[slug]/settings` for now (settings modal is a separate task not in this spec).

- [ ] **Step 5.1: Implement `header.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/header.tsx
import Link from 'next/link';
import type { ProjectFull } from '@/server/projects/types';

interface Props {
  project: ProjectFull;
}

export default function Header({ project }: Props) {
  const totalVideos = Object.values(project.pipelineCount).reduce((a, b) => a + b, 0);
  const themeColor = project.theme_color ?? '#C8FF57';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {/* Color dot */}
        <span
          className="mt-1.5 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: themeColor }}
          aria-hidden="true"
        />
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <p className="mt-0.5 text-sm text-white/50">
            {project.niche && <span>nicho: {project.niche} · </span>}
            {totalVideos} {totalVideos === 1 ? 'video' : 'videos'}
          </p>
        </div>
      </div>

      <Link
        href={`/projects/${project.slug}/settings`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
      >
        Configurar
      </Link>
    </div>
  );
}
```

- [ ] **Step 5.2: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 5.3: Commit**

```bash
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/header.tsx
git commit -m "feat(project-detail): implement Header component"
```

---

## Task 6: Generate Button Component

**Files:**
- Modify: `apps/web/src/app/(dashboard)/projects/[slug]/_components/generate-button.tsx`

This is the most important component. It has 5 states:
1. `idle` — big CTA button, enabled
2. `config-missing` — button disabled, shows warning + link
3. `loading` — spinner while POST request is in flight
4. `in-progress` — shows `<GenerationProgress>` instead of button
5. `rate-limited` — disabled with countdown

The `GenerationProgress` component is imported and rendered in-place when a generation is running.

- [ ] **Step 6.1: Implement `generate-button.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/generate-button.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useProjectRealtime } from '@/hooks/use-project-realtime';
import GenerationProgress from './generation-progress';

interface Props {
  projectId: string;
  projectSlug: string;
  configOk: boolean;
  autoGenerate: boolean;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'in-progress'; videoId: string; status: string }
  | { kind: 'done'; videoId: string }
  | { kind: 'error'; message: string }
  | { kind: 'rate-limited'; retryAfterSec: number };

export default function GenerateButton({ projectId, projectSlug, configOk, autoGenerate }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const autoFired = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (state.kind === 'loading' || state.kind === 'in-progress') return;
    setState({ kind: 'loading' });

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const retryAfterSec = data.retryAfter ?? 60;
        setState({ kind: 'rate-limited', retryAfterSec });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({ kind: 'error', message: data.error ?? 'Error al generar' });
        toast.error(data.error ?? 'Error al generar el video');
        return;
      }

      const { videoId } = await res.json();
      setState({ kind: 'in-progress', videoId, status: 'pending' });
    } catch {
      setState({ kind: 'idle' });
      toast.error('Error de red. Intentá de nuevo.');
    }
  }, [projectId, state.kind]);

  // Autogenerate on mount when ?autogenerate=1
  useEffect(() => {
    if (autoGenerate && !autoFired.current && configOk && state.kind === 'idle') {
      autoFired.current = true;
      handleGenerate();
    }
  }, [autoGenerate, configOk, handleGenerate, state.kind]);

  // Rate limit countdown
  useEffect(() => {
    if (state.kind !== 'rate-limited') return;
    if (state.retryAfterSec <= 0) {
      setState({ kind: 'idle' });
      return;
    }
    const timer = setTimeout(() => {
      setState((prev) =>
        prev.kind === 'rate-limited'
          ? { kind: 'rate-limited', retryAfterSec: prev.retryAfterSec - 1 }
          : prev,
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [state]);

  // Realtime: update progress status
  useProjectRealtime(
    state.kind === 'in-progress' ? projectId : undefined,
    (event) => {
      if (state.kind !== 'in-progress') return;
      if (event.videoId !== state.videoId) return;
      if (event.status === 'ready') {
        setState({ kind: 'done', videoId: state.videoId });
        // Scroll to history — dispatch a custom event the history component listens to
        window.dispatchEvent(new CustomEvent('video-ready', { detail: { videoId: state.videoId } }));
        setTimeout(() => setState({ kind: 'idle' }), 3000);
      } else {
        setState({ kind: 'in-progress', videoId: state.videoId, status: event.status });
      }
    },
  );

  // CONFIG MISSING state
  if (!configOk) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-8 text-center">
        <p className="text-amber-400">⚠ Configurá tus archivos primero</p>
        <p className="text-sm text-white/50">Necesitás subir los patrones virales y la info de marca.</p>
        <Link
          href={`/projects/${projectSlug}/settings`}
          className="rounded-lg bg-amber-500/20 px-4 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
        >
          Ir a configuración
        </Link>
      </div>
    );
  }

  // IN-PROGRESS state
  if (state.kind === 'in-progress') {
    return <GenerationProgress videoId={state.videoId} currentStatus={state.status} />;
  }

  // DONE flash
  if (state.kind === 'done') {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-[#C8FF57]/30 bg-[#C8FF57]/5 px-6 py-8 text-center">
        <p className="text-2xl">🎉</p>
        <p className="font-semibold text-[#C8FF57]">¡Video listo!</p>
      </div>
    );
  }

  // ERROR state
  if (state.kind === 'error') {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-6 py-8 text-center">
        <p className="text-red-400">⚠ {state.message}</p>
        <button
          onClick={() => setState({ kind: 'idle' })}
          className="rounded-lg bg-red-500/20 px-4 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/30 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // RATE LIMITED state
  if (state.kind === 'rate-limited') {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center">
        <p className="text-white/60">⏳ Esperá {state.retryAfterSec}s para generar otro video</p>
      </div>
    );
  }

  // IDLE / LOADING state
  return (
    <button
      onClick={handleGenerate}
      disabled={state.kind === 'loading'}
      className="group relative flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-[#C8FF57]/20 bg-[#C8FF57]/5 px-6 py-8 text-center transition-all hover:border-[#C8FF57]/40 hover:bg-[#C8FF57]/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {state.kind === 'loading' ? (
        <span className="text-white/60 animate-pulse">Iniciando...</span>
      ) : (
        <>
          <span className="text-3xl" aria-hidden="true">🎬</span>
          <span className="text-xl font-bold text-white tracking-wide">GENERAR VIDEO</span>
          <span className="text-sm text-white/40">Click → idea + script + audio + render</span>
          <span className="text-xs text-white/30">⏱ ~3 min · próxima generación libre</span>
        </>
      )}
    </button>
  );
}
```

- [ ] **Step 6.2: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 6.3: Commit**

```bash
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/generate-button.tsx
git commit -m "feat(project-detail): implement GenerateButton with state machine + realtime"
```

---

## Task 7: Generation Progress Component

**Files:**
- Modify: `apps/web/src/app/(dashboard)/projects/[slug]/_components/generation-progress.tsx`

Maps video status → ordered step list. Each step shows ✓ (done), ⟳ (current), or ⏳ (pending).

- [ ] **Step 7.1: Implement `generation-progress.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/generation-progress.tsx
'use client';

interface Props {
  videoId: string;
  currentStatus: string;
}

const STEPS = [
  { key: 'pending',    label: 'Iniciando generación' },
  { key: 'scripting',  label: 'Idea + script escrito' },
  { key: 'audio',      label: 'Audio sintetizando...' },
  { key: 'captions',   label: 'Captions' },
  { key: 'rendering',  label: 'Renderizando video' },
  { key: 'ready',      label: 'Caption Instagram' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

const STATUS_ORDER: StepKey[] = ['pending', 'scripting', 'audio', 'captions', 'rendering', 'ready'];

function getStepState(stepKey: StepKey, currentStatus: string): 'done' | 'active' | 'pending' {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus as StepKey);
  const stepIdx = STATUS_ORDER.indexOf(stepKey);
  if (currentIdx === -1) return 'pending';
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

export default function GenerationProgress({ videoId: _, currentStatus }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5">
      <p className="mb-4 text-sm font-semibold text-white/50 uppercase tracking-wider">Generando video</p>
      <ol className="space-y-3">
        {STEPS.map((step) => {
          const stepState = getStepState(step.key, currentStatus);
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span className="w-5 text-center" aria-hidden="true">
                {stepState === 'done' && <span className="text-[#C8FF57]">✓</span>}
                {stepState === 'active' && <span className="animate-spin inline-block text-white/70">⟳</span>}
                {stepState === 'pending' && <span className="text-white/20">⏳</span>}
              </span>
              <span
                className={
                  stepState === 'done'
                    ? 'text-sm text-white/60 line-through'
                    : stepState === 'active'
                    ? 'text-sm text-white font-medium'
                    : 'text-sm text-white/30'
                }
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 7.2: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 7.3: Commit**

```bash
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/generation-progress.tsx
git commit -m "feat(project-detail): implement GenerationProgress step list"
```

---

## Task 8: Caption Modal

**Files:**
- Modify: `apps/web/src/app/(dashboard)/projects/[slug]/_components/caption-modal.tsx`

Tabs: Instagram / TikTok / YouTube Shorts. Each tab shows the caption text and a "Copiar" button that writes to clipboard + shows a toast.

- [ ] **Step 8.1: Implement `caption-modal.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/caption-modal.tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProjectVideo } from '@/server/videos/types';

interface Props {
  video: ProjectVideo;
  open: boolean;
  onClose: () => void;
}

export default function CaptionModal({ video, open, onClose }: Props) {
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const tabs = [
    { id: 'instagram', label: 'Instagram', text: video.instagramCaption },
    { id: 'tiktok',    label: 'TikTok',    text: video.tiktokCaption },
    { id: 'shorts',    label: 'Shorts',    text: video.youtubeCaption },
  ].filter((t) => t.text);

  async function handleCopy(tabId: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedTab(tabId);
    toast.success('Caption copiado al portapapeles');
    setTimeout(() => setCopiedTab(null), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-[#1a1d24] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Caption</DialogTitle>
        </DialogHeader>

        {tabs.length === 0 ? (
          <p className="text-sm text-white/50 py-4">
            Los captions aún no están disponibles para este video.
          </p>
        ) : (
          <Tabs defaultValue={tabs[0].id}>
            <TabsList className="bg-white/5 border border-white/10">
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="data-[state=active]:bg-white/10">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.map((t) => (
              <TabsContent key={t.id} value={t.id} className="space-y-3">
                <div className="min-h-24 rounded-lg bg-white/5 p-3 text-sm text-white/80 whitespace-pre-wrap">
                  {t.text}
                </div>
                <button
                  onClick={() => handleCopy(t.id, t.text!)}
                  className="w-full rounded-lg bg-[#C8FF57] py-2 text-sm font-semibold text-[#111318] hover:bg-[#d4ff6e] transition-colors"
                >
                  {copiedTab === t.id ? '✓ Copiado' : 'Copiar'}
                </button>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8.2: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 8.3: Commit**

```bash
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/caption-modal.tsx
git commit -m "feat(project-detail): implement CaptionModal with tabs + clipboard copy"
```

---

## Task 9: Video Row

**Files:**
- Modify: `apps/web/src/app/(dashboard)/projects/[slug]/_components/video-row.tsx`

One row in the history table. Handles: download MP4 (fetches signed URL), open caption modal, open publish dialog. Errors on generation show a retry button.

- [ ] **Step 9.1: Implement `video-row.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/video-row.tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import CaptionModal from './caption-modal';
import { markVideoPublished } from '@/server/videos/actions';
import type { ProjectVideo } from '@/server/videos/types';

interface Props {
  video: ProjectVideo;
}

const STATUS_ICON: Record<string, string> = {
  ready: '🟢',
  published: '🟢',
  rendering: '🟡',
  audio: '🟡',
  captions: '🟡',
  scripting: '🟡',
  pending: '🟡',
  error: '🔴',
};

const STATUS_LABEL: Record<string, string> = {
  ready: 'Listo',
  published: 'Publicado',
  rendering: 'Renderizando',
  audio: 'Sintetizando',
  captions: 'Captions',
  scripting: 'Scripting',
  pending: 'Pendiente',
  error: 'Error',
};

export default function VideoRow({ video }: Props) {
  const [captionOpen, setCaptionOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishUrl, setPublishUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function handleDownload() {
    if (!video.videoUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/videos/${video.id}/signed-url`);
      if (!res.ok) throw new Error('No se pudo obtener la URL');
      const { url } = await res.json();
      window.open(url, '_blank');
    } catch {
      toast.error('No se pudo descargar el video');
    } finally {
      setDownloading(false);
    }
  }

  async function handlePublish() {
    if (!publishUrl || !publishUrl.startsWith('http')) {
      toast.error('Ingresá una URL válida');
      return;
    }
    setPublishing(true);
    const result = await markVideoPublished(video.id, publishUrl);
    setPublishing(false);
    if (result.ok) {
      toast.success('Video marcado como publicado');
      setPublishOpen(false);
    } else {
      toast.error(result.error.message);
    }
  }

  const isReady = video.status === 'ready' || video.status === 'published';
  const isPublished = video.status === 'published';
  const createdAgo = formatDistanceToNow(new Date(video.createdAt), { addSuffix: true, locale: es });

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/2 transition-colors">
        {/* Status */}
        <td className="py-3 px-4 text-sm whitespace-nowrap">
          <span>{STATUS_ICON[video.status] ?? '⚪'}</span>{' '}
          <span className="text-white/70">{STATUS_LABEL[video.status] ?? video.status}</span>
          {video.status === 'error' && video.errorMessage && (
            <span className="ml-2 text-xs text-red-400" title={video.errorMessage}>⚠</span>
          )}
        </td>

        {/* Hook */}
        <td className="py-3 px-4 text-sm text-white/80 max-w-xs">
          <span className="line-clamp-2">{video.hookText ?? '—'}</span>
        </td>

        {/* Format */}
        <td className="py-3 px-4 text-sm text-white/50 whitespace-nowrap">
          {video.format ?? '—'}
        </td>

        {/* Duration */}
        <td className="py-3 px-4 text-sm text-white/50 whitespace-nowrap">
          {video.durationSec ? `${video.durationSec}s` : '—'}
        </td>

        {/* Created */}
        <td className="py-3 px-4 text-sm text-white/40 whitespace-nowrap">
          {createdAgo}
        </td>

        {/* Actions */}
        <td className="py-3 px-4 whitespace-nowrap">
          {isReady ? (
            <div className="flex items-center gap-2">
              {video.videoUrl && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  title="Descargar MP4"
                  className="rounded px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  {downloading ? '...' : '↓ MP4'}
                </button>
              )}
              <button
                onClick={() => setCaptionOpen(true)}
                title="Copiar caption"
                className="rounded px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                📋
              </button>
              {!isPublished && (
                <button
                  onClick={() => setPublishOpen(true)}
                  title="Marcar publicado"
                  className="rounded px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  📤
                </button>
              )}
              {isPublished && video.publishedUrl && (
                <a
                  href={video.publishedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded px-2 py-1 text-xs text-[#C8FF57]/60 hover:text-[#C8FF57] transition-colors"
                  title="Ver post"
                >
                  ↗
                </a>
              )}
            </div>
          ) : (
            <span className="text-white/20 text-xs">—</span>
          )}
        </td>
      </tr>

      {/* Caption modal */}
      <CaptionModal video={video} open={captionOpen} onClose={() => setCaptionOpen(false)} />

      {/* Publish dialog */}
      <Dialog open={publishOpen} onOpenChange={(v) => !v && setPublishOpen(false)}>
        <DialogContent className="max-w-sm bg-[#1a1d24] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Marcar como publicado</DialogTitle>
          </DialogHeader>
          <input
            type="url"
            placeholder="https://www.instagram.com/p/..."
            value={publishUrl}
            onChange={(e) => setPublishUrl(e.target.value)}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#C8FF57]/50"
          />
          <DialogFooter>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="w-full rounded-lg bg-[#C8FF57] py-2 text-sm font-semibold text-[#111318] hover:bg-[#d4ff6e] transition-colors disabled:opacity-60"
            >
              {publishing ? 'Guardando...' : 'Guardar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 9.2: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 9.3: Commit**

```bash
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/video-row.tsx
git commit -m "feat(project-detail): implement VideoRow with download, caption, publish"
```

---

## Task 10: Video History Component

**Files:**
- Modify: `apps/web/src/app/(dashboard)/projects/[slug]/_components/video-history.tsx`

Server component that fetches videos. Uses Framer Motion for row entrance animation. Listens to the `video-ready` custom event to trigger a client-side refresh when a new video finishes generating.

> **Note:** Since this is a server component, it can't use hooks directly. The realtime refresh is handled by making the inner table a client component that re-fetches when the `video-ready` event fires.

- [ ] **Step 10.1: Implement `video-history.tsx`** (split into server + client parts)

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/video-history.tsx
import { createClient } from '@/lib/supabase/server';
import { fetchProjectVideos } from '@/server/videos/queries';
import VideoHistoryClient from './video-history-client';

interface Props {
  projectId: string;
  projectSlug: string;
}

export default async function VideoHistory({ projectId, projectSlug: _ }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const videos = await fetchProjectVideos(projectId, user.id);

  return <VideoHistoryClient initialVideos={videos} projectId={projectId} userId={user.id} />;
}
```

- [ ] **Step 10.2: Create `video-history-client.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/video-history-client.tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProjectVideos } from '@/server/videos/actions';
import VideoRow from './video-row';
import type { ProjectVideo } from '@/server/videos/types';

interface Props {
  initialVideos: ProjectVideo[];
  projectId: string;
  userId: string;
}

export default function VideoHistoryClient({ initialVideos, projectId, userId: _ }: Props) {
  const [videos, setVideos] = useState(initialVideos);
  const [, startTransition] = useTransition();

  // Refresh when a new video finishes generating
  useEffect(() => {
    function handleVideoReady() {
      startTransition(async () => {
        const result = await getProjectVideos(projectId);
        if (result.ok) setVideos(result.data);
      });
    }
    window.addEventListener('video-ready', handleVideoReady);
    return () => window.removeEventListener('video-ready', handleVideoReady);
  }, [projectId]);

  if (videos.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/2 px-6 py-12 text-center">
        <p className="text-white/30 text-sm">Aún no hay videos. ¡Generá el primero!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="py-2 px-4 text-xs font-medium text-white/40 uppercase tracking-wider">Estado</th>
            <th className="py-2 px-4 text-xs font-medium text-white/40 uppercase tracking-wider">Hook</th>
            <th className="py-2 px-4 text-xs font-medium text-white/40 uppercase tracking-wider">Format</th>
            <th className="py-2 px-4 text-xs font-medium text-white/40 uppercase tracking-wider">Dur.</th>
            <th className="py-2 px-4 text-xs font-medium text-white/40 uppercase tracking-wider">Creado</th>
            <th className="py-2 px-4 text-xs font-medium text-white/40 uppercase tracking-wider">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {videos.map((video, i) => (
              <motion.tr
                key={video.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
                style={{ display: 'contents' }}
              >
                <VideoRow video={video} />
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
```

> **Caveat:** `motion.tr` with `display: contents` may not work in all browsers. If Framer Motion doesn't support `<tr>` well, wrap each `<VideoRow>` in a `motion.div` inside a single `<tr><td colSpan={6}>` or use CSS animation classes directly. Test and adapt.

- [ ] **Step 10.3: Add `video-history-client.tsx` to the file map**

Note: this file is not in the original spec's file-ownership list but is required by the implementation. It lives alongside the other `_components/` files.

- [ ] **Step 10.4: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 10.5: Commit**

```bash
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/video-history.tsx
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/video-history-client.tsx
git commit -m "feat(project-detail): implement VideoHistory with Framer Motion + realtime refresh"
```

---

## Task 11: Files Panel

**Files:**
- Modify: `apps/web/src/app/(dashboard)/projects/[slug]/_components/files-panel.tsx`

Shows project files with parse status badges. "Re-subir" triggers a file upload modal (uses the native `<input type="file">` since T4-P09's upload component may not be available yet — keep it simple and functional).

- [ ] **Step 11.1: Implement `files-panel.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/files-panel.tsx
'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ProjectFull, ProjectFile } from '@/server/projects/types';

interface Props {
  project: ProjectFull;
}

const FILE_TYPE_ICONS: Record<string, string> = {
  viral_patterns: '🧬',
  project_info: '🏷️',
};

const PARSE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ok: { label: 'OK', color: 'text-[#C8FF57]' },
  parsing: { label: 'Parseando...', color: 'text-amber-400' },
  error: { label: 'Error', color: 'text-red-400' },
  pending: { label: 'Pendiente', color: 'text-white/40' },
};

function FileRow({ file }: { file: ProjectFile }) {
  const [uploading, setUploading] = useState(false);
  const icon = FILE_TYPE_ICONS[file.file_type] ?? '📄';
  const status = PARSE_STATUS_CONFIG[(file as any).parse_status ?? 'pending'];
  const updatedAgo = formatDistanceToNow(new Date(file.updated_at ?? file.created_at), {
    addSuffix: true,
    locale: es,
  });

  async function handleReupload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setUploading(true);
    // TODO: integrate with T4-P09 upload logic once available
    // For now, show a toast placeholder
    await new Promise((r) => setTimeout(r, 500));
    setUploading(false);
    alert('Re-upload: conectar con T4-P09');
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{file.file_type}</p>
          <p className="text-xs text-white/40">
            v{(file as any).version ?? 1} ·{' '}
            <span className={status.color}>{status.label}</span> · {updatedAgo}
          </p>
        </div>
      </div>
      <label className="shrink-0 cursor-pointer rounded px-2 py-1 text-xs text-white/40 hover:text-white hover:bg-white/10 transition-colors">
        {uploading ? '...' : '↻'}
        <input type="file" className="sr-only" onChange={handleReupload} />
      </label>
    </div>
  );
}

export default function FilesPanel({ project }: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
        Archivos del proyecto
      </h2>

      {project.files.length === 0 ? (
        <p className="text-sm text-white/30">Sin archivos. Subí patrones virales e info de marca.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {project.files.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </div>
      )}

      <button className="mt-3 w-full rounded-lg border border-dashed border-white/10 py-2 text-xs text-white/30 hover:border-white/20 hover:text-white/50 transition-colors">
        + Subir nueva versión
      </button>
    </div>
  );
}
```

- [ ] **Step 11.2: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 11.3: Commit**

```bash
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/files-panel.tsx
git commit -m "feat(project-detail): implement FilesPanel with parse status badges"
```

---

## Task 12: Anti-Repeat Summary

**Files:**
- Modify: `apps/web/src/app/(dashboard)/projects/[slug]/_components/anti-repeat-summary.tsx`

Collapsible section showing how many hooks, topics, and formats have been used in the last 14 days. Fetches count from the server.

- [ ] **Step 12.1: Add `fetchAntiRepeatStats` to `server/videos/queries.ts`**

Append after `fetchProjectVideos`:

```typescript
export interface AntiRepeatStats {
  hooksUsed: number;
  topicsUsed: number;
  formatsUsed: number;
  recentHooks: Array<{ id: string; hookText: string }>;
}

export async function fetchAntiRepeatStats(
  projectId: string,
  userId: string,
): Promise<AntiRepeatStats> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('video_ideas')
    .select('id, hook_text, format')
    .eq('project_id', projectId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return { hooksUsed: 0, topicsUsed: 0, formatsUsed: 0, recentHooks: [] };

  const uniqueFormats = new Set(data.map((r) => r.format).filter(Boolean));

  return {
    hooksUsed: data.length,
    topicsUsed: 0, // no topic field yet; placeholder
    formatsUsed: uniqueFormats.size,
    recentHooks: data
      .slice(0, 10)
      .map((r) => ({ id: r.id, hookText: (r as any).hook_text ?? '' })),
  };
}
```

Also add a server action in `actions.ts`:

```typescript
export async function getAntiRepeatStats(projectId: string): Promise<Result<AntiRepeatStats>> {
  try {
    const user = await getUser();
    const data = await fetchAntiRepeatStats(projectId, user.id);
    return { ok: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}
```

Don't forget to import `AntiRepeatStats` and `fetchAntiRepeatStats` in `actions.ts`.

- [ ] **Step 12.2: Implement `anti-repeat-summary.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/anti-repeat-summary.tsx
import { createClient } from '@/lib/supabase/server';
import { fetchAntiRepeatStats } from '@/server/videos/queries';
import AntiRepeatSummaryClient from './anti-repeat-summary-client';

interface Props {
  projectId: string;
}

export default async function AntiRepeatSummary({ projectId }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const stats = await fetchAntiRepeatStats(projectId, user.id);

  return <AntiRepeatSummaryClient stats={stats} />;
}
```

- [ ] **Step 12.3: Create `anti-repeat-summary-client.tsx`**

```typescript
// apps/web/src/app/(dashboard)/projects/[slug]/_components/anti-repeat-summary-client.tsx
'use client';

import { useState } from 'react';
import type { AntiRepeatStats } from '@/server/videos/queries';

interface Props {
  stats: AntiRepeatStats;
}

export default function AntiRepeatSummaryClient({ stats }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/5 bg-white/2 px-4 py-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Evitando repetir (últimos 14 días)
          </p>
          <p className="mt-1 text-sm text-white/60">
            {stats.hooksUsed} hooks usados · {stats.formatsUsed} formatos
          </p>
        </div>
        <span className="text-white/30 text-xs">{expanded ? '▲' : '▼'} ver detalle</span>
      </button>

      {expanded && stats.recentHooks.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
          {stats.recentHooks.map((hook) => (
            <li key={hook.id} className="text-xs text-white/40 line-clamp-1">
              · {hook.hookText}
            </li>
          ))}
        </ul>
      )}

      {expanded && stats.recentHooks.length === 0 && (
        <p className="mt-3 text-xs text-white/30 border-t border-white/5 pt-3">Sin datos recientes.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 12.4: Verify**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 12.5: Commit**

```bash
git add apps/web/src/server/videos/queries.ts apps/web/src/server/videos/actions.ts
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/anti-repeat-summary.tsx
git add apps/web/src/app/(dashboard)/projects/[slug]/_components/anti-repeat-summary-client.tsx
git commit -m "feat(project-detail): implement AntiRepeatSummary with 14-day hook stats"
```

---

## Task 13: Integration, Mobile Layout, E2E Verification

Final wiring: verify the page works end-to-end, check responsive layout, and clean up stubs.

- [ ] **Step 13.1: Replace `page.tsx` stubs with correct imports**

Ensure `page.tsx` imports `VideoHistory` and `AntiRepeatSummary` (both are server components that internally use client components). Make sure the import paths are correct.

- [ ] **Step 13.2: Add mobile layout classes to `page.tsx`**

The top-level grid should be:
```tsx
<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
```

On mobile the files panel should appear below the main content (grid flows naturally). No extra CSS needed.

- [ ] **Step 13.3: Start dev server and navigate to `/projects/apex-dev`**

```bash
cd apps/web && npm run dev
```

Open `http://localhost:3000/projects/apex-dev`.

Expected: page loads with header, generate button, empty history (or existing videos), files panel.

- [ ] **Step 13.4: E2E checklist**

Manual verification — check each item:
- [ ] Header shows project name, colored dot, video count
- [ ] Generate button is visible immediately (before history loads)
- [ ] If patterns/brand missing: warning shows with link to settings
- [ ] Click "Generar video" → button switches to "Iniciando..." immediately (optimistic UI)
- [ ] After POST succeeds → GenerationProgress component appears with step list
- [ ] Video status updates appear in the progress list (watch Supabase realtime)
- [ ] When video reaches `ready` → success state → scroll to history
- [ ] New video row appears in history with 🟢 status
- [ ] Download button → opens signed URL in new tab
- [ ] Caption modal → 3 tabs → copy to clipboard → toast appears
- [ ] "Marcar publicado" → enter URL → saves → row shows ↗ link
- [ ] `?autogenerate=1` query param → generate fires on mount
- [ ] Files panel shows badges with parse status
- [ ] Anti-repeat summary shows counts; expand to see hook list
- [ ] Mobile: single column, generate button at top
- [ ] Tablet: single column, files panel below history

- [ ] **Step 13.5: Final commit**

```bash
git add -A -- apps/web/src/app/(dashboard)/projects/[slug]/
git commit -m "feat(project-detail): complete T4-P10 project detail page integration"
```

---

## Known Limitations & Future Work

- **File re-upload:** The "Re-subir" button in FilesPanel shows a placeholder until T4-P09's upload component is available. Wire it in when T4-P09 lands.
- **Video preview modal:** The spec mentions clicking a row opens a preview modal with transcription + performance. This is not implemented; add in a follow-up.
- **Project settings modal:** The "Configurar" button links to `/projects/[slug]/settings` which doesn't exist yet. The modal with Basics/Patterns/Brand/Voice tabs is a separate task.
- **Topics field:** `AntiRepeatStats.topicsUsed` is hardcoded to 0 until a `topic` column exists on `video_ideas`.
- **DB types cast:** Several `(row as any)` casts in `fetchProjectVideos` will be removable once the DB types are regenerated after migrations adding `duration_sec`, `instagram_caption`, `tiktok_caption`, `youtube_caption`, `published_url`, `error_message`.
- **Framer Motion `<tr>` animation:** If `motion.tr` doesn't animate correctly, replace with row-level CSS `@keyframes` or use `motion.div` inside each `<td>`.
