# Setup Supabase — Proyecto Virus

> ✅ El proyecto ya está creado y activo. Esta guía es para completar la config local.

## Datos del proyecto

| Campo | Valor |
|-------|-------|
| Nombre | Virus |
| Project Ref | `jdkjnaivkucnpvmwuraz` |
| Region | us-west-2 (Oregon) |
| DB Host | `db.jdkjnaivkucnpvmwuraz.supabase.co` |
| Status | ACTIVE_HEALTHY |

---

## 1. Variables de entorno

Abrí `.env.local` y pegá esto (reemplazá `<service_role>` en el paso 2):

```env
NEXT_PUBLIC_SUPABASE_URL=https://jdkjnaivkucnpvmwuraz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impka2puYWl2a3VjbnB2bXd1cmF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2ODEzMDQsImV4cCI6MjA5MzI1NzMwNH0.1HxWaPuVta8eefvLvn_wFf-I_ek0I5-Hz6ApZXXggRM
SUPABASE_SERVICE_ROLE_KEY=<ver paso 2>
SUPABASE_PROJECT_REF=jdkjnaivkucnpvmwuraz
```

---

## 2. Obtener la service_role key

La `service_role` key es secreta y NO se puede obtener via MCP. Obtenerla manualmente:

1. Ir a [https://supabase.com/dashboard/project/jdkjnaivkucnpvmwuraz/settings/api](https://supabase.com/dashboard/project/jdkjnaivkucnpvmwuraz/settings/api)
2. Sección **Project API keys** → copiar la key `service_role`.
3. Pegar en `.env.local` como `SUPABASE_SERVICE_ROLE_KEY=eyJ...`

> ⚠️ **NUNCA** expongas esta key al cliente (no en `NEXT_PUBLIC_*`, no en el browser).

---

## 3. Google OAuth

1. Ir a **Authentication → Providers → Google** en el dashboard.
2. Si no está habilitado:
   - Ir a [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth client ID.
   - Application type: **Web application**.
   - Authorized redirect URI: `https://jdkjnaivkucnpvmwuraz.supabase.co/auth/v1/callback`
   - Pegar Client ID + Client Secret en Supabase → Guardar.
3. Ir a **Authentication → URL Configuration** y verificar:
   - Site URL: `http://localhost:3000`
   - Redirect URLs incluye: `http://localhost:3000/auth/callback` y `https://virus.vercel.app/auth/callback`

---

## 4. Vincular CLI local

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref jdkjnaivkucnpvmwuraz
```

Esto habilita `supabase db push` para deployar migraciones al proyecto cloud.

---

## 5. Verificar conexión

```bash
pnpm dlx supabase status
```

Debe mostrar el proyecto `jdkjnaivkucnpvmwuraz` como vinculado.
