# Setup Vercel — Proyecto Virus

> El deploy real lo hace **T7-P02**. Acá solo dejás la cuenta lista.

## 1. Crear cuenta

1. Ir a [https://vercel.com/signup](https://vercel.com/signup) → login con GitHub.
2. Listo. No deployar todavía.

---

## 2. (Opcional) Deploy preview anticipado

Si querés un preview ahora antes de T7:

1. **Add New Project** → Import el repo de GitHub.
2. Root path: `apps/web`
3. Framework: Next.js (autodetecta).
4. Environment Variables: pegar todas las de `.env.local`.
5. Deploy.

La URL quedará tipo `https://virus-xxxx.vercel.app`.

---

## 3. Variables de entorno en Vercel

Cuando hagas el deploy real (T7), vas a necesitar cargar estas vars en **Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF
ANTHROPIC_API_KEY
ASSEMBLYAI_API_KEY
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
REMOTION_LAMBDA_FUNCTION_NAME
REMOTION_S3_BUCKET
REMOTION_SERVE_URL
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
NEXT_PUBLIC_APP_URL
```

> Tip: Vercel permite importar un `.env` directo desde la UI — más rápido que pegar una por una.

---

## 4. Actualizar Supabase redirect URL

Una vez que tengas la URL de Vercel, agregar en Supabase → Authentication → URL Configuration:

```
https://tu-proyecto.vercel.app/auth/callback
```
