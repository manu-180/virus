---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 2
depende-de: [T2-P01]
file-ownership:
  - apps/web/src/app/(auth)/
  - apps/web/src/app/(auth)/login/page.tsx
  - apps/web/src/app/(auth)/login/login-form.tsx
  - apps/web/src/app/(auth)/login/actions.ts
  - apps/web/src/app/auth/callback/route.ts
  - apps/web/src/app/auth/sign-out/route.ts
  - apps/web/src/components/auth/
  - apps/web/src/components/auth/user-menu.tsx
duracion-estimada: 45 min
---

# T2-P02 — Auth flow completo (Google OAuth + email magic link)

## Contexto

Login premium para Virus. Manuel quiere logearse con **Google OAuth** (1 click) y opcionalmente con **email magic link** (fallback si Google falla). Sin password — no tiene sentido para un usuario único.

Lee:
- `prompts/00-ARCHITECTURE.md`
- `apps/web/src/lib/supabase/server.ts` (cliente ya creado por T2-P01)

## Tarea

### 1. Página de login (`/login`)

`apps/web/src/app/(auth)/layout.tsx` — layout sin navbar (centrado).

`apps/web/src/app/(auth)/login/page.tsx` — server component:
- Si ya hay user → redirect a `/dashboard`.
- Renderiza `<LoginForm />`.

`apps/web/src/app/(auth)/login/login-form.tsx` — client component:
- Heading "Virus" + tagline "Dev content, weaponized".
- Botón grande "Continuar con Google" (con icono).
- Separador "o".
- Input email + botón "Enviar magic link".
- Si magic link enviado → mostrar estado "Revisá tu email".
- Estética premium: dark, glassmorphism sutil, animación de entrada con framer-motion.

### 2. Server actions (`actions.ts`)

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = (await headers()).get('origin');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
  if (data.url) redirect(data.url);
}

export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  if (!email) return { error: 'Email requerido' };
  const supabase = await createClient();
  const origin = (await headers()).get('origin');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { ok: true };
}
```

### 3. Callback handler (`/auth/callback`)

```ts
// apps/web/src/app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
}
```

### 4. Sign out (`/auth/sign-out`)

POST handler que llama `supabase.auth.signOut()` y redirige a `/login`.

### 5. User menu component (`<UserMenu />`)

Avatar + dropdown con:
- Email del user.
- Link a `/settings`.
- Botón "Cerrar sesión" (POST a `/auth/sign-out`).

Lo va a usar el navbar del dashboard (T4).

## Reglas

- TODOS los formularios usan **server actions**, no API routes.
- Usá los componentes shadcn ya instalados en T1-P03 (`Button`, `Input`, `Form`, etc.).
- Mostrar errores con `<Toaster />` de sonner.
- Layout de login: centered card 400px, fondo con sutil radial gradient color accent.

## Output esperado

Login funcional. Después del flujo Google OAuth, Manuel termina en `/dashboard` (página placeholder por ahora — T4 la termina). Magic link envía email y, al click, llega a `/dashboard`.

## Verificación

```bash
pnpm dev
# 1. Visitar /login
# 2. Click "Continuar con Google" → flujo OAuth → redirect a /dashboard
# 3. Click logout → vuelve a /login
# 4. Probar magic link: ingresar email → "Revisá tu email" → abrir email → click link → /dashboard
```
