---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 2
depende-de: [T1-P01, T1-P02]
file-ownership:
  - apps/web/src/lib/supabase/client.ts
  - apps/web/src/lib/supabase/server.ts
  - apps/web/src/lib/supabase/admin.ts
  - apps/web/src/lib/supabase/middleware.ts
  - apps/web/src/middleware.ts
  - packages/db/src/index.ts
duracion-estimada: 30 min
---

# T2-P01 — Clientes Supabase (browser, server, admin) + middleware

## Contexto

Configurar los 3 clientes de Supabase requeridos en Next.js 15+ con App Router:
- **Browser client** (RSC client components, hooks).
- **Server client** (server components, route handlers, server actions).
- **Admin client** (server-only, usa service_role, bypass RLS — para Inngest worker).

Y configurar middleware para refrescar la sesión y proteger rutas.

Lee:
- `prompts/00-ARCHITECTURE.md`
- `packages/db/migrations/0001_init.sql` (para conocer tablas y types)

## Tarea

### 1. `apps/web/src/lib/supabase/client.ts` — Browser

```ts
'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@virus/db';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

### 2. `apps/web/src/lib/supabase/server.ts` — Server (RSC + actions)

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@virus/db';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server component — ignore
          }
        },
      },
    },
  );
}
```

### 3. `apps/web/src/lib/supabase/admin.ts` — Service role

```ts
import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@virus/db';

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

Importa `'server-only'` para que **explote a build time si se importa desde un client component**.

### 4. `apps/web/src/lib/supabase/middleware.ts` y `src/middleware.ts`

Implementar el middleware oficial de `@supabase/ssr` para refrescar sesión:
- En cada request: `supabase.auth.getUser()` para refrescar token cookie.
- Si la ruta es `/dashboard/*` o `/api/*` y no hay user → redirect a `/login`.
- Si la ruta es `/login` o `/` y hay user → redirect a `/dashboard`.

`src/middleware.ts`:
```ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

`src/lib/supabase/middleware.ts`:
- Crea client con cookies del request/response.
- `await supabase.auth.getUser()` (no `getSession()` — el blog post de Supabase explica por qué).
- Aplica reglas de redirect arriba.
- Devuelve la `NextResponse` con cookies actualizadas.

### 5. `packages/db/src/index.ts`

Re-exporta types generados:

```ts
export type { Database } from './types.gen';
export type { Json } from './types.gen';

// Aliases convenientes
import type { Database } from './types.gen';
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
```

## Dependencias a instalar

```bash
pnpm --filter @virus/web add @supabase/supabase-js @supabase/ssr
pnpm --filter @virus/db add @supabase/supabase-js
```

## Verificación

- `pnpm typecheck` pasa.
- `pnpm dev` levanta sin error.
- Visitar `/dashboard` sin auth → redirect a `/login`.
- Visitar `/login` con auth → redirect a `/dashboard`.

(Las páginas `/login` y `/dashboard` aún no existen como UI completa — eso es T4. Vos podés dejar placeholders mínimos para verificar el redirect.)

## Notas

- Usá **siempre** `getUser()` en middleware/server, NUNCA `getSession()`. La sesión solo es trustable via getUser().
- El admin client NO se importa desde client components ni server components que se rendereen al cliente. Solo route handlers, server actions y worker.
