# Onboarding Flow (T4-P07) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-step first-run wizard that gates dashboard access until brand voice, voice clone (or explicit skip), and first video generation are complete.

**Architecture:**
- `profiles.onboarding_completed_at` is the single gate check — null means wizard incomplete
- Onboarding route lives at `apps/web/src/app/onboarding/` **outside** the `(dashboard)` route group — this avoids circular redirect and allows a minimal layout without the nav sidebar
- Step resume: server component reads profile fields to determine `initialStep`; URL param `?step=N` tracks position during the session
- Each wizard step saves to DB via Server Action before advancing; wizard reverts on error
- framer-motion `AnimatePresence` drives horizontal slide transitions

**Tech Stack:** Next.js 15 App Router, Supabase SSR (`@supabase/ssr`), framer-motion v12, React Hook Form + Zod, shadcn/ui (Button/Input/Select/Slider/Progress/Badge/Textarea/Card), canvas-confetti, sonner

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| CREATE | `packages/db/migrations/0007_onboarding.sql` | Add onboarding columns to profiles |
| CREATE | `apps/web/src/server/onboarding/queries.ts` | Read onboarding profile from DB |
| CREATE | `apps/web/src/server/onboarding/actions.ts` | Save brand/voice/complete steps |
| CREATE | `apps/web/src/components/onboarding-gate.tsx` | Redirect-or-pass gate (server component) |
| CREATE | `apps/web/src/app/onboarding/layout.tsx` | Bare layout — no sidebar, no topbar |
| CREATE | `apps/web/src/app/onboarding/page.tsx` | Server entry — loads profile, picks initial step |
| CREATE | `apps/web/src/app/onboarding/onboarding-wizard.tsx` | Client wizard shell, step state + animations |
| CREATE | `apps/web/src/app/onboarding/_steps/step-welcome.tsx` | Step 0 — welcome & value props |
| CREATE | `apps/web/src/app/onboarding/_steps/step-brand.tsx` | Step 1 — handle, language, content mix, topics |
| CREATE | `apps/web/src/app/onboarding/_steps/step-voice.tsx` | Step 2 — voice clone upload or skip |
| CREATE | `apps/web/src/app/onboarding/_steps/step-first-video.tsx` | Step 3 — idea selection + confetti + complete |
| CREATE | `apps/web/src/components/dashboard-tour.tsx` | Tour overlay activated by `?tour=true` |
| MODIFY | `apps/web/src/app/(dashboard)/layout.tsx` | Add OnboardingGate wrapping AppShell |
| MODIFY | `apps/web/src/app/(dashboard)/dashboard/page.tsx` | Add DashboardTour island |
| MODIFY | `apps/web/src/app/(dashboard)/dashboard/_components/stats-grid.tsx` | Add `data-tour="stats"` |
| MODIFY | `apps/web/src/app/(dashboard)/dashboard/_components/active-pipeline.tsx` | Add `data-tour="pipeline"` |
| MODIFY | `apps/web/src/app/(dashboard)/dashboard/_components/quick-actions.tsx` | Add `data-tour="actions"` |

---

## Task 1: Install canvas-confetti

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the package**

```bash
cd C:\MisProyectos\Armagedon\virus\apps\web && npm install canvas-confetti @types/canvas-confetti
```

- [ ] **Step 2: Verify installation**

Check `package.json` contains `"canvas-confetti"` in `dependencies` and `"@types/canvas-confetti"` in `devDependencies`.

---

## Task 2: Database migration — onboarding columns

**Files:**
- Create: `packages/db/migrations/0007_onboarding.sql`

- [ ] **Step 1: Create migration file**

```sql
-- T4-P07 Migration 0007: Onboarding tracking columns on profiles
--
-- onboarding_completed_at  — null = wizard incomplete (used by OnboardingGate)
-- onboarding_voice_skipped — true = user chose default voice instead of cloning
--
-- Both columns use ADD COLUMN IF NOT EXISTS for idempotency.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_voice_skipped boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply to Supabase**

Apply via Supabase MCP tool `apply_migration` or:
```bash
npx supabase db push
```

- [ ] **Step 3: Verify columns exist**

Run in Supabase SQL editor or MCP `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('onboarding_completed_at', 'onboarding_voice_skipped');
```
Expected: 2 rows returned.

- [ ] **Step 4: Regenerate Supabase TypeScript types**

After applying the migration, regenerate types so the new columns are known to TypeScript:
```bash
npx supabase gen types typescript --project-id <your-project-id> \
  > packages/db/src/types.gen.ts
```
If using the Supabase MCP, use `generate_typescript_types` tool instead.

Confirm `profiles` Row type now includes `onboarding_completed_at` and `onboarding_voice_skipped`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0007_onboarding.sql packages/db/src/types.gen.ts
git commit -m "feat: add onboarding_completed_at + onboarding_voice_skipped to profiles"
```

---

## Task 3: Onboarding queries

**Files:**
- Create: `apps/web/src/server/onboarding/queries.ts`

- [ ] **Step 1: Create file**

```typescript
import { createClient } from '@/lib/supabase/server';

export async function getOnboardingProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select(
      'id, handle, default_language, brand_voice, default_voice_clone_id, ' +
      'onboarding_completed_at, onboarding_voice_skipped'
    )
    .eq('id', userId)
    .single();
  return data;
}

export type OnboardingProfile = NonNullable<
  Awaited<ReturnType<typeof getOnboardingProfile>>
>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/server/onboarding/queries.ts
git commit -m "feat: add onboarding profile query"
```

---

## Task 4: Onboarding server actions

**Files:**
- Create: `apps/web/src/server/onboarding/actions.ts`

- [ ] **Step 1: Create file**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

export type BrandStepInput = {
  handle: string;
  language: string;
  audience: string;
  topics: string[];
  contentMix: { educational: number; promotional: number; personal: number };
};

export type StarterIdea = {
  hook: string;
  angle: string;
  format: string;
};

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

// ---------------------------------------------------------------------------
// Step 1: Save brand data
// ---------------------------------------------------------------------------

export async function saveBrandStep(
  input: BrandStepInput
): Promise<Result<void>> {
  try {
    const user = await getUser();
    const supabase = await createClient();

    const { error } = await supabase
      .from('profiles')
      .update({
        handle: input.handle.trim(),
        default_language: input.language,
        brand_voice: {
          audience: input.audience.trim(),
          topics: input.topics,
          contentMix: input.contentMix,
        },
      })
      .eq('id', user.id);

    if (error) return { ok: false, error: error.message };
    revalidatePath('/onboarding');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

// ---------------------------------------------------------------------------
// Step 2: Save voice choice
// ---------------------------------------------------------------------------

export async function saveVoiceStep(input: {
  voiceCloneId?: string;
  skip: boolean;
}): Promise<Result<void>> {
  try {
    const user = await getUser();
    const supabase = await createClient();

    const { error } = await supabase
      .from('profiles')
      .update({
        default_voice_clone_id: input.voiceCloneId ?? null,
        onboarding_voice_skipped: input.skip,
      })
      .eq('id', user.id);

    if (error) return { ok: false, error: error.message };
    revalidatePath('/onboarding');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

// ---------------------------------------------------------------------------
// Step 3: Generate starter ideas (no DB write — returns ideas for UI)
// ---------------------------------------------------------------------------

export async function generateStarterIdeas(): Promise<Result<StarterIdea[]>> {
  try {
    const user = await getUser();
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('brand_voice')
      .eq('id', user.id)
      .single();

    const brandVoice = (profile?.brand_voice ?? {}) as {
      topics?: string[];
    };
    const topics = brandVoice.topics ?? [];
    const topic = topics[0] ?? 'tu área de expertise';

    const ideas: StarterIdea[] = [
      {
        hook: `El error más común en ${topic} que nadie te dice`,
        angle: 'Contrarian take con datos propios',
        format: 'talking-head',
      },
      {
        hook: `Lo que aprendí después de 1 año trabajando en ${topic}`,
        angle: 'Historia personal + lecciones clave',
        format: 'talking-head',
      },
      {
        hook: `Cómo hago ${topic} en menos de 10 minutos`,
        angle: 'Tutorial paso a paso',
        format: 'screen-capture',
      },
    ];

    return { ok: true, data: ideas };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

// ---------------------------------------------------------------------------
// Step 3: Complete onboarding — create project, pillars, video idea
// ---------------------------------------------------------------------------

export async function completeOnboarding(
  selectedIdea: StarterIdea
): Promise<Result<{ projectId: string; videoIdeaId: string }>> {
  try {
    const user = await getUser();
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('handle, default_language, brand_voice, default_voice_clone_id')
      .eq('id', user.id)
      .single();

    if (!profile) return { ok: false, error: 'Perfil no encontrado' };

    const brandVoice = (profile.brand_voice ?? {}) as {
      audience?: string;
      topics?: string[];
      contentMix?: { educational: number; promotional: number; personal: number };
    };

    const slug = (profile.handle ?? 'mi-proyecto')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Create default project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        slug,
        name: profile.handle ?? 'Mi Proyecto',
        niche: 'general',
        language: profile.default_language,
        voice_clone_id: profile.default_voice_clone_id,
      })
      .select('id')
      .single();

    if (projectError) return { ok: false, error: projectError.message };

    // Create content pillars from brand contentMix
    const mix = brandVoice.contentMix ?? { educational: 60, promotional: 30, personal: 10 };
    const topics = brandVoice.topics ?? [];

    await supabase.from('content_pillars').insert([
      {
        project_id: project.id,
        name: 'Educativo',
        weight: mix.educational,
        description: 'Contenido que enseña y aporta valor',
        example_themes: topics.slice(0, 2),
      },
      {
        project_id: project.id,
        name: 'Promocional',
        weight: mix.promotional,
        description: 'Contenido que muestra tu trabajo y resultados',
        example_themes: [],
      },
      {
        project_id: project.id,
        name: 'Personal',
        weight: mix.personal,
        description: 'Tu historia y proceso',
        example_themes: [],
      },
    ]);

    // Create selected video idea
    const { data: videoIdea, error: ideaError } = await supabase
      .from('video_ideas')
      .insert({
        project_id: project.id,
        hook: selectedIdea.hook,
        angle: selectedIdea.angle,
        format: selectedIdea.format,
        status: 'approved',
      })
      .select('id')
      .single();

    if (ideaError) return { ok: false, error: ideaError.message };

    // Mark onboarding complete
    await supabase
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id);

    revalidatePath('/dashboard');
    return { ok: true, data: { projectId: project.id, videoIdeaId: videoIdea.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/server/onboarding/actions.ts
git commit -m "feat: add onboarding server actions (brand, voice, complete)"
```

---

## Task 5: OnboardingGate component

**Files:**
- Create: `apps/web/src/components/onboarding-gate.tsx`

The onboarding route is outside `(dashboard)`, so no circular redirect risk — this gate simply redirects to `/onboarding` when the wizard is not yet complete.

- [ ] **Step 1: Create file**

```typescript
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout already redirects to /login if no user — just pass through
  if (!user) return <>{children}</>;

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed_at) {
    redirect('/onboarding');
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/onboarding-gate.tsx
git commit -m "feat: add OnboardingGate server component"
```

---

## Task 6: Update dashboard layout

**Files:**
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Read the current file** (already read — it's at lines 1-24)

- [ ] **Step 2: Replace with gated version**

```typescript
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { OnboardingGate } from '@/components/onboarding-gate';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <OnboardingGate>
      <AppShell email={user.email ?? ''} avatarUrl={avatarUrl}>
        {children}
      </AppShell>
    </OnboardingGate>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(dashboard)/layout.tsx
git commit -m "feat: wrap dashboard layout with OnboardingGate"
```

---

## Task 7: Onboarding layout (bare — no sidebar)

**Files:**
- Create: `apps/web/src/app/onboarding/layout.tsx`

- [ ] **Step 1: Create file**

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bienvenido a Virus',
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/onboarding/layout.tsx
git commit -m "feat: add bare onboarding layout"
```

---

## Task 8: Onboarding page (server entry)

**Files:**
- Create: `apps/web/src/app/onboarding/page.tsx`

The page reads the profile, determines which step to resume from, and renders the client wizard.

Resume logic:
- `brand_voice` is empty object `{}` AND no `handle` → step 0 (welcome)
- `brand_voice` is filled AND `handle` set → step 2 (voice)
- brand filled + voice done (clone or skip) → step 3 (first video)
- Otherwise → step 0

- [ ] **Step 1: Create file**

```typescript
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOnboardingProfile } from '@/server/onboarding/queries';
import { OnboardingWizard } from './onboarding-wizard';

function resolveInitialStep(profile: Awaited<ReturnType<typeof getOnboardingProfile>>): number {
  if (!profile) return 0;

  const brandVoice = (profile.brand_voice ?? {}) as Record<string, unknown>;
  const hasBrand =
    profile.handle &&
    Object.keys(brandVoice).length > 0 &&
    brandVoice.audience;

  const hasVoice =
    profile.default_voice_clone_id || profile.onboarding_voice_skipped;

  if (hasBrand && hasVoice) return 3;
  if (hasBrand) return 2;
  return 0;
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const profile = await getOnboardingProfile(user.id);

  // Already completed — don't show onboarding again
  if (profile?.onboarding_completed_at) {
    redirect('/dashboard');
  }

  const initialStep = resolveInitialStep(profile);

  return (
    <Suspense fallback={null}>
      <OnboardingWizard initialStep={initialStep} profile={profile} />
    </Suspense>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/onboarding/page.tsx
git commit -m "feat: add onboarding server page with resume logic"
```

---

## Task 9: Onboarding wizard shell (client component)

**Files:**
- Create: `apps/web/src/app/onboarding/onboarding-wizard.tsx`

This is the core client component. Responsibilities:
- Renders the progress sidebar
- Manages current step as React state
- Updates URL `?step=N` on navigation (so browser back/forward works)
- Passes `onNext` / `onBack` callbacks to step components
- Wraps step content with framer-motion `AnimatePresence` for slide transitions

- [ ] **Step 1: Create file**

```typescript
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { OnboardingProfile } from '@/server/onboarding/queries';
import { StepWelcome } from './_steps/step-welcome';
import { StepBrand } from './_steps/step-brand';
import { StepVoice } from './_steps/step-voice';
import { StepFirstVideo } from './_steps/step-first-video';

const STEPS = [
  { label: 'Bienvenida', number: 1 },
  { label: 'Tu marca', number: 2 },
  { label: 'Tu voz', number: 3 },
  { label: 'Tu primer video', number: 4 },
];

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
};

interface Props {
  initialStep: number;
  profile: OnboardingProfile | null;
}

export function OnboardingWizard({ initialStep, profile }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStep = searchParams.get('step');
  const [step, setStep] = useState(
    urlStep !== null ? parseInt(urlStep, 10) : initialStep
  );
  const [direction, setDirection] = useState(1);

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', String(next));
    router.replace(`/onboarding?${params.toString()}`, { scroll: false });
  };

  const stepContent = [
    <StepWelcome key={0} onNext={() => goTo(1)} />,
    <StepBrand key={1} profile={profile} onNext={() => goTo(2)} onBack={() => goTo(0)} />,
    <StepVoice key={2} profile={profile} onNext={() => goTo(3)} onBack={() => goTo(1)} />,
    <StepFirstVideo key={3} profile={profile} onBack={() => goTo(2)} />,
  ];

  return (
    <div className="flex min-h-screen">
      {/* ── Progress sidebar ── */}
      <aside className="hidden md:flex w-72 flex-col border-r border-border p-8 gap-8">
        <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
          Virus
        </div>

        <nav className="flex flex-col gap-4 mt-4">
          {STEPS.map((s, i) => {
            const isDone = i < step;
            const isActive = i === step;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 text-sm transition-colors ${
                  isActive
                    ? 'text-foreground font-semibold'
                    : isDone
                    ? 'text-[var(--accent)]'
                    : 'text-muted-foreground'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    isDone
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-black'
                      : isActive
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-muted text-muted-foreground'
                  }`}
                >
                  {isDone ? '✓' : s.number}
                </div>
                {s.label}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="text-xs text-muted-foreground">
            Paso {step + 1} de {STEPS.length}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${((step + 1) / STEPS.length) * 100}%`,
                backgroundColor: 'var(--accent)',
              }}
            />
          </div>
        </div>
      </aside>

      {/* ── Step content ── */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="absolute inset-0 flex items-center justify-center p-6 md:p-12"
          >
            {stepContent[step]}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/onboarding/onboarding-wizard.tsx
git commit -m "feat: add OnboardingWizard client shell with slide transitions"
```

---

## Task 10: Step 0 — Welcome

**Files:**
- Create: `apps/web/src/app/onboarding/_steps/step-welcome.tsx`

- [ ] **Step 1: Create file**

```typescript
'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Zap, Video, Download } from 'lucide-react';

interface Props {
  onNext: () => void;
}

const FEATURES = [
  {
    icon: Zap,
    title: 'Ideas virales basadas en research real',
    description: 'Analizamos qué funciona en tu nicho y generamos hooks probados.',
  },
  {
    icon: Video,
    title: 'Videos verticales con tu voz',
    description: 'Script, voz clonada, captions y render automático.',
  },
  {
    icon: Download,
    title: 'Vos solo descargás y publicás',
    description: 'Un video listo en ~5 minutos. Sin edición manual.',
  },
];

export function StepWelcome({ onNext }: Props) {
  return (
    <div className="w-full max-w-lg flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold text-foreground leading-tight">
          Bienvenido a{' '}
          <span style={{ color: 'var(--accent)' }}>Virus</span>,<br />
          Manuel.
        </h1>
        <p className="text-muted-foreground text-lg">
          Configuremos tu cuenta en 4 pasos rápidos.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {FEATURES.map(({ icon: Icon, title, description }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.12 }}
            className="flex items-start gap-4"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(62,207,142,0.12)' }}
            >
              <Icon size={20} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{title}</p>
              <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <Button size="lg" onClick={onNext} className="w-full font-semibold">
        Empezar →
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/onboarding/_steps/step-welcome.tsx
git commit -m "feat: add onboarding Step 0 — welcome screen"
```

---

## Task 11: Step 1 — Brand (handle, language, content mix, topics)

**Files:**
- Create: `apps/web/src/app/onboarding/_steps/step-brand.tsx`

The content mix (3 sliders) must sum to exactly 100. Validate before allowing Next. Show live sum indicator. Preset is 60/30/10.

- [ ] **Step 1: Create file**

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import type { OnboardingProfile } from '@/server/onboarding/queries';
import { saveBrandStep } from '@/server/onboarding/actions';

const schema = z.object({
  handle: z.string().min(2, 'Mínimo 2 caracteres').max(40),
  language: z.string().min(1, 'Elegí un idioma'),
  audience: z.string().min(10, 'Describí brevemente tu audiencia'),
  topics: z.array(z.string()).min(1, 'Agregá al menos un tema'),
  educational: z.number().min(0).max(100),
  promotional: z.number().min(0).max(100),
  personal: z.number().min(0).max(100),
});

type FormData = z.infer<typeof schema>;

const TOPIC_SUGGESTIONS = [
  'Desarrollo web', 'Flutter', 'Python', 'Inteligencia artificial',
  'Marketing digital', 'Finanzas personales', 'Diseño UX', 'Emprendimiento',
  'Productividad', 'Fitness', 'Cocina', 'Fotografía',
];

const LANGUAGES = [
  { value: 'es-AR', label: 'Español (Argentina)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
];

interface Props {
  profile: OnboardingProfile;
  onNext: () => void;
  onBack: () => void;
}

export function StepBrand({ profile, onNext, onBack }: Props) {
  const brandVoice = (profile?.brand_voice ?? {}) as {
    audience?: string;
    topics?: string[];
    contentMix?: { educational: number; promotional: number; personal: number };
  };

  const [customTopicInput, setCustomTopicInput] = useState('');
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        handle: profile?.handle ?? '',
        language: profile?.default_language ?? 'es-AR',
        audience: brandVoice.audience ?? '',
        topics: brandVoice.topics ?? [],
        educational: brandVoice.contentMix?.educational ?? 60,
        promotional: brandVoice.contentMix?.promotional ?? 30,
        personal: brandVoice.contentMix?.personal ?? 10,
      },
    });

  const [educational, promotional, personal, topics] = watch([
    'educational', 'promotional', 'personal', 'topics',
  ]);
  const mixSum = educational + promotional + personal;
  const mixValid = mixSum === 100;

  const toggleTopic = (topic: string) => {
    const current = topics ?? [];
    const next = current.includes(topic)
      ? current.filter((t) => t !== topic)
      : current.length < 5
      ? [...current, topic]
      : current;
    setValue('topics', next, { shouldValidate: true });
  };

  const addCustomTopic = () => {
    const trimmed = customTopicInput.trim();
    if (!trimmed || topics.includes(trimmed) || topics.length >= 5) return;
    setValue('topics', [...topics, trimmed], { shouldValidate: true });
    setCustomTopicInput('');
  };

  const onSubmit = (data: FormData) => {
    if (!mixValid) return;
    startTransition(async () => {
      const result = await saveBrandStep({
        handle: data.handle,
        language: data.language,
        audience: data.audience,
        topics: data.topics,
        contentMix: {
          educational: data.educational,
          promotional: data.promotional,
          personal: data.personal,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onNext();
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full max-w-lg flex flex-col gap-6"
    >
      <div>
        <h2 className="text-2xl font-bold">Tu marca personal</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Esta info guía cada idea que generamos para vos.
        </p>
      </div>

      {/* Handle */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handle">Tu handle / nombre</Label>
        <Input id="handle" placeholder="@manu.dev" {...register('handle')} />
        {errors.handle && (
          <p className="text-xs text-destructive">{errors.handle.message}</p>
        )}
      </div>

      {/* Language */}
      <div className="flex flex-col gap-1.5">
        <Label>Idioma de tus videos</Label>
        <Controller
          name="language"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí un idioma" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Audience */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audience">¿A quién le hablás?</Label>
        <Input
          id="audience"
          placeholder="Desarrolladores que aprenden Flutter..."
          {...register('audience')}
        />
        {errors.audience && (
          <p className="text-xs text-destructive">{errors.audience.message}</p>
        )}
      </div>

      {/* Content mix sliders */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Mix de contenido</Label>
          <span
            className={`text-xs font-mono ${
              mixValid ? 'text-[var(--accent)]' : 'text-destructive'
            }`}
          >
            {mixSum}% {mixValid ? '✓' : `(faltan ${100 - mixSum}%)`}
          </span>
        </div>

        {(
          [
            { name: 'educational', label: 'Educativo', color: '#3ECF8E' },
            { name: 'promotional', label: 'Promocional', color: '#FFC000' },
            { name: 'personal', label: 'Personal', color: '#0175C2' },
          ] as const
        ).map(({ name, label, color }) => (
          <Controller
            key={name}
            name={name}
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-24">{label}</span>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[field.value]}
                  onValueChange={([v]) => field.onChange(v)}
                  className="flex-1"
                  style={{ '--slider-thumb-color': color } as React.CSSProperties}
                />
                <span className="text-sm font-mono w-10 text-right">{field.value}%</span>
              </div>
            )}
          />
        ))}
      </div>

      {/* Topics */}
      <div className="flex flex-col gap-2">
        <Label>Temas favoritos (máx 5)</Label>
        <div className="flex flex-wrap gap-2">
          {TOPIC_SUGGESTIONS.map((t) => (
            <Badge
              key={t}
              variant={topics.includes(t) ? 'default' : 'outline'}
              className="cursor-pointer select-none transition-colors"
              onClick={() => toggleTopic(t)}
            >
              {t}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="Otro tema..."
            value={customTopicInput}
            onChange={(e) => setCustomTopicInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTopic())}
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustomTopic}>
            + Agregar
          </Button>
        </div>
        {errors.topics && (
          <p className="text-xs text-destructive">{errors.topics.message}</p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
          ← Atrás
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={isPending || !mixValid}
        >
          {isPending ? 'Guardando...' : 'Siguiente →'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/onboarding/_steps/step-brand.tsx
git commit -m "feat: add onboarding Step 1 — brand form with content mix sliders"
```

---

## Task 12: Step 2 — Voice clone

**Files:**
- Create: `apps/web/src/app/onboarding/_steps/step-voice.tsx`

The actual ElevenLabs API call is a TODO (T4-P06 provides the integration). For now: the UI is complete, the skip path works fully, and the clone upload shows a placeholder success.

- [ ] **Step 1: Create file**

```typescript
'use client';

import { useState, useTransition, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Mic, Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import type { OnboardingProfile } from '@/server/onboarding/queries';
import { saveVoiceStep } from '@/server/onboarding/actions';

interface Props {
  profile: OnboardingProfile;
  onNext: () => void;
  onBack: () => void;
}

type VoiceState = 'idle' | 'uploading' | 'done' | 'skipped';

export function StepVoice({ profile, onNext, onBack }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<VoiceState>(
    profile?.default_voice_clone_id ? 'done' : profile?.onboarding_voice_skipped ? 'skipped' : 'idle'
  );
  const [isPending, startTransition] = useTransition();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState('uploading');
    // TODO (T4-P06): Upload to Supabase Storage voice_samples bucket,
    // then call ElevenLabs /v1/voices/add API, save returned voice_id via saveVoiceStep.
    // For now, simulate success after a brief delay.
    await new Promise((r) => setTimeout(r, 1200));
    const placeholderVoiceId = `onboarding_${Date.now()}`;
    startTransition(async () => {
      const result = await saveVoiceStep({ voiceCloneId: placeholderVoiceId, skip: false });
      if (!result.ok) {
        toast.error(result.error);
        setState('idle');
        return;
      }
      setState('done');
    });
  };

  const handleSkip = () => {
    startTransition(async () => {
      const result = await saveVoiceStep({ skip: true });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setState('skipped');
      onNext();
    });
  };

  const handleNext = () => {
    if (state !== 'done' && state !== 'skipped') return;
    onNext();
  };

  return (
    <div className="w-full max-w-lg flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">Tu voz</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Clonamos tu voz para que cada video suene exactamente como vos.
        </p>
      </div>

      {state === 'done' ? (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5">
          <CheckCircle size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <p className="font-semibold text-sm">Voz lista</p>
            <p className="text-xs text-muted-foreground">
              Tus videos van a sonar con tu propia voz.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="border border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-4 text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(62,207,142,0.1)' }}
            >
              <Mic size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="font-semibold">Subí una muestra de tu voz</p>
              <p className="text-sm text-muted-foreground mt-1">
                ~1 minuto hablando con tu tono natural. MP3, WAV o M4A.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={state === 'uploading' || isPending}
            >
              <Upload size={14} className="mr-2" />
              {state === 'uploading' ? 'Procesando...' : 'Elegir archivo'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-surface border border-border">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
            <span>
              Si saltás este paso, tus videos van a usar la voz "Mateo" de ElevenLabs.
              Podés clonar tu voz después en{' '}
              <strong>Settings → Voz</strong>.
            </span>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Saltear por ahora y usar voz default
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
          ← Atrás
        </Button>
        {state === 'done' && (
          <Button className="flex-1" onClick={handleNext} disabled={isPending}>
            Siguiente →
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/onboarding/_steps/step-voice.tsx
git commit -m "feat: add onboarding Step 2 — voice clone with skip option"
```

---

## Task 13: Step 3 — First video + confetti + complete

**Files:**
- Create: `apps/web/src/app/onboarding/_steps/step-first-video.tsx`

Flow:
1. "Generemos tu primer video" button
2. Calls `generateStarterIdeas()` → shows 3 idea cards
3. User selects one
4. "Lanzar video" → calls `completeOnboarding(idea)` → redirects to `/dashboard?tour=true`

- [ ] **Step 1: Create file**

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Rocket, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OnboardingProfile } from '@/server/onboarding/queries';
import {
  generateStarterIdeas,
  completeOnboarding,
  type StarterIdea,
} from '@/server/onboarding/actions';

interface Props {
  profile: OnboardingProfile;
  onBack: () => void;
}

export function StepFirstVideo({ profile: _profile, onBack }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ideas, setIdeas] = useState<StarterIdea[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const handleGenerateIdeas = () => {
    startTransition(async () => {
      const result = await generateStarterIdeas();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setIdeas(result.data);
    });
  };

  const handleComplete = () => {
    if (selected === null || !ideas) return;
    startTransition(async () => {
      const result = await completeOnboarding(ideas[selected]);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push('/dashboard?tour=true');
    });
  };

  return (
    <div className="w-full max-w-lg flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">Tu primer video</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Elegí una idea y lo lanzamos ahora.
        </p>
      </div>

      {!ideas ? (
        <div className="flex flex-col items-center gap-6 py-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(62,207,142,0.12)' }}
          >
            <Sparkles size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold">Generemos tu primer video</p>
            <p className="text-sm text-muted-foreground mt-1">
              Vamos a sugerir 3 ideas basadas en tu marca.
            </p>
          </div>
          <Button size="lg" onClick={handleGenerateIdeas} disabled={isPending}>
            {isPending ? 'Generando ideas...' : 'Generar ideas →'}
          </Button>
        </div>
      ) : (
        <AnimatePresence>
          <div className="flex flex-col gap-3">
            {ideas.map((idea, i) => (
              <motion.button
                key={i}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => setSelected(i)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  selected === i
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                    : 'border-border hover:border-border/80 bg-surface'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1.5">
                    <p className="font-semibold text-sm leading-snug">{idea.hook}</p>
                    <p className="text-xs text-muted-foreground">{idea.angle}</p>
                    <Badge variant="outline" className="w-fit text-[10px]">
                      {idea.format}
                    </Badge>
                  </div>
                  {selected === i && (
                    <ChevronRight
                      size={16}
                      className="shrink-0 mt-0.5"
                      style={{ color: 'var(--accent)' }}
                    />
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </AnimatePresence>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isPending}
        >
          ← Atrás
        </Button>
        {ideas && (
          <Button
            className="flex-1"
            onClick={handleComplete}
            disabled={selected === null || isPending}
          >
            <Rocket size={15} className="mr-2" />
            {isPending ? 'Lanzando...' : 'Lanzar mi primer video'}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/onboarding/_steps/step-first-video.tsx
git commit -m "feat: add onboarding Step 3 — first video selection + complete"
```

---

## Task 14: Dashboard tour component

**Files:**
- Create: `apps/web/src/components/dashboard-tour.tsx`

Activated when `?tour=true` is in URL. Fires confetti on mount, shows a sonner toast, then walks through 4 sequential tooltip steps pointing at dashboard elements via `data-tour` attributes. Cleans up URL after last step.

- [ ] **Step 1: Create file**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const TOUR_STEPS = [
  {
    target: 'stats',
    title: 'Tus métricas',
    description: 'Acá ves vistas, engagement y crecimiento de tu cuenta en tiempo real.',
    position: 'bottom' as const,
  },
  {
    target: 'pipeline',
    title: 'Pipeline activo',
    description: 'Seguí el estado de cada video: script → audio → render → listo.',
    position: 'bottom' as const,
  },
  {
    target: 'actions',
    title: 'Acciones rápidas',
    description: 'Generá nuevas ideas, creá videos o agendá un lote con un click.',
    position: 'top' as const,
  },
  {
    target: 'calendar',
    title: 'Calendario',
    description: 'Planificá cuándo se publica cada video y evitá solapamientos.',
    position: 'top' as const,
  },
];

interface TooltipProps {
  step: (typeof TOUR_STEPS)[0];
  stepIndex: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  targetEl: Element | null;
}

function TourTooltip({ step, stepIndex, total, onNext, onSkip, targetEl }: TooltipProps) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    setPos({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [targetEl]);

  if (!targetEl) return null;

  const isBottom = step.position === 'bottom';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 pointer-events-none"
        style={{ backdropFilter: 'blur(1px)' }}
      />
      {/* Highlight ring */}
      <div
        className="absolute z-50 rounded-lg ring-2 ring-[var(--accent)] pointer-events-none"
        style={{
          top: pos.top - 4,
          left: pos.left - 4,
          width: pos.width + 8,
          height: (targetEl as HTMLElement).offsetHeight + 8,
        }}
      />
      {/* Tooltip */}
      <motion.div
        initial={{ opacity: 0, y: isBottom ? -8 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="fixed z-50 w-72 bg-elevated border border-border rounded-xl p-4 shadow-xl"
        style={{
          top: isBottom
            ? pos.top + (targetEl as HTMLElement).offsetHeight + 12
            : pos.top - 160,
          left: Math.min(pos.left, window.innerWidth - 300),
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <p className="font-semibold text-sm">{step.title}</p>
          <button
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{step.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {stepIndex + 1} / {total}
          </span>
          <Button size="sm" onClick={onNext}>
            {stepIndex < total - 1 ? 'Siguiente →' : 'Listo ✓'}
          </Button>
        </div>
      </motion.div>
    </>
  );
}

export function DashboardTour() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isTour = searchParams.get('tour') === 'true';

  const [tourStep, setTourStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [targetEl, setTargetEl] = useState<Element | null>(null);

  // Fire confetti + toast on mount when tour=true
  useEffect(() => {
    if (!isTour) return;

    import('canvas-confetti').then(({ default: confetti }) => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.4 },
        colors: ['#3ECF8E', '#C8FF57', '#ffffff'],
      });
    });

    toast.success('¡Listo! Tu primer video estará en ~5 minutos.', {
      duration: 6000,
    });

    setIsActive(true);

    // Clean tour param from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete('tour');
    const newUrl = params.toString() ? `/dashboard?${params}` : '/dashboard';
    router.replace(newUrl, { scroll: false });
  }, [isTour]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isActive) return;
    const step = TOUR_STEPS[tourStep];
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    setTargetEl(el);
  }, [isActive, tourStep]);

  const handleNext = useCallback(() => {
    if (tourStep < TOUR_STEPS.length - 1) {
      setTourStep((s) => s + 1);
    } else {
      setIsActive(false);
    }
  }, [tourStep]);

  const handleSkip = useCallback(() => {
    setIsActive(false);
  }, []);

  if (!isActive) return null;

  return (
    <AnimatePresence>
      <TourTooltip
        key={tourStep}
        step={TOUR_STEPS[tourStep]}
        stepIndex={tourStep}
        total={TOUR_STEPS.length}
        onNext={handleNext}
        onSkip={handleSkip}
        targetEl={targetEl}
      />
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/dashboard-tour.tsx
git commit -m "feat: add DashboardTour component with confetti + step tooltips"
```

---

## Task 15: Add data-tour attributes to dashboard components

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/_components/stats-grid.tsx`
- Modify: `apps/web/src/app/(dashboard)/dashboard/_components/active-pipeline.tsx`
- Modify: `apps/web/src/app/(dashboard)/dashboard/_components/quick-actions.tsx`

For each file: read the outermost wrapper element and add `data-tour="<target>"` attribute.

- [ ] **Step 1: Read each file**

Read stats-grid.tsx, active-pipeline.tsx, quick-actions.tsx to find the root JSX element.

- [ ] **Step 2: Add data-tour to stats-grid root element**

Find the outermost `<div>` or container in StatsGrid and add `data-tour="stats"`.

Example diff:
```diff
- <div className="grid grid-cols-...">
+ <div data-tour="stats" className="grid grid-cols-...">
```

- [ ] **Step 3: Add data-tour to active-pipeline root element**

```diff
- <div className="...">
+ <div data-tour="pipeline" className="...">
```

- [ ] **Step 4: Add data-tour to quick-actions root element**

```diff
- <div className="...">
+ <div data-tour="actions" className="...">
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(dashboard)/dashboard/_components/stats-grid.tsx
git add apps/web/src/app/(dashboard)/dashboard/_components/active-pipeline.tsx
git add apps/web/src/app/(dashboard)/dashboard/_components/quick-actions.tsx
git commit -m "feat: add data-tour attributes for dashboard tour targeting"
```

---

## Task 16: Update dashboard page — add DashboardTour island

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/page.tsx`

The page is a Server Component. Add `DashboardTour` as a client island (it reads `useSearchParams` internally via `Suspense`).

- [ ] **Step 1: Import DashboardTour at top of file**

```diff
+ import { Suspense } from 'react'; // already imported
+ import { DashboardTour } from '@/components/dashboard-tour';
```

- [ ] **Step 2: Add the tour island inside the return, wrapped in Suspense**

Place it as the first child of the outer `<div>`:
```diff
  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
+     <Suspense fallback={null}>
+       <DashboardTour />
+     </Suspense>
      <div className="max-w-7xl mx-auto space-y-8">
```

Note: `DashboardTour` needs `Suspense` because it calls `useSearchParams()` which requires the component to be wrapped when used in a server-rendered route.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: add DashboardTour island to dashboard page"
```

---

## Task 17: TypeScript check

- [ ] **Step 1: Run type check**

```bash
cd C:\MisProyectos\Armagedon\virus\apps\web && npx tsc --noEmit
```

Expected: no errors. Fix any type errors before proceeding.

- [ ] **Step 2: Fix common issues**

If `onboarding_completed_at` or `onboarding_voice_skipped` are unknown on the Supabase types, regenerate types:
```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
```
Or update `packages/db/src/types.gen.ts` manually to add the two new columns.

---

## Task 18: Manual verification (dev server)

- [ ] **Step 1: Start dev server**

```bash
cd C:\MisProyectos\Armagedon\virus\apps\web && npm run dev
```

- [ ] **Step 2: Test new user flow (no onboarding completed)**

  - Clear `onboarding_completed_at` for your user in Supabase:
    ```sql
    UPDATE profiles SET onboarding_completed_at = NULL WHERE id = '<your-user-id>';
    ```
  - Navigate to `/dashboard` → should redirect to `/onboarding`
  - Complete all 4 steps
  - Confirm redirect to `/dashboard?tour=true`
  - Confirm confetti fires
  - Confirm toast "¡Listo! Tu primer video estará en ~5 minutos."
  - Confirm tour tooltips appear and advance correctly

- [ ] **Step 3: Test resume**

  - Set `onboarding_completed_at = NULL` and fill `brand_voice` in DB
  - Navigate to `/onboarding` → should land on step 2 (voice), not step 0

- [ ] **Step 4: Test returning user**

  - With `onboarding_completed_at` set, navigate to `/onboarding` → should redirect to `/dashboard`

- [ ] **Step 5: Test skip voice**

  - In step 2, click "Saltear por ahora" → should advance to step 3 and show the warning

- [ ] **Step 6: Commit final**

```bash
git add .
git commit -m "chore: verify onboarding flow complete"
```

---

## Known Limitations / TODOs

| Item | Location | Notes |
|------|----------|-------|
| ElevenLabs voice clone API call | `step-voice.tsx:46` | Marked `TODO (T4-P06)`. Currently saves placeholder ID. Real implementation requires Supabase Storage upload + ElevenLabs API. |
| Voice wizard shared component | `step-voice.tsx` | Once T4-P06 builds `/settings/voice`, extract shared `<VoiceWizard>` component and update this step to use it. |
| Idea generation | `actions.ts:generateStarterIdeas` | Currently uses template strings. Connect to `@virus/shared/viral` SuggestionEngine when project patterns are available. |
| Tour calendar target | `dashboard-tour.tsx:TOUR_STEPS[3]` | `data-tour="calendar"` needs to be added to the calendar nav item or page, not just a dashboard component. |
| Mobile progress sidebar | `onboarding-wizard.tsx` | Sidebar is `hidden md:flex`. Add a mobile progress bar or compact indicator for small screens. |
