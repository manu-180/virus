# Plan: IG Publisher — multi-cuenta, dentro del monorepo virus

**Autor:** Claude (sesión 2026-05-10)
**Estado:** Aprobado por Manuel (libre albedrío). Ejecución en curso.
**Issue trigger:** El botón "Descargar ZIP" de carruseles falla. Manuel quiere reemplazar/complementar con publicación directa a Instagram desde el programa, multi-cuenta (apex + botlode + futuras).

---

## Objetivo

Publicar carruseles generados por virus directamente a Instagram desde el dashboard, soportando **N cuentas IG** (una por proyecto), sin requerir Instagram abierto en ninguna PC. El servicio corre 24/7 en Railway, dentro del monorepo virus.

## Restricciones / decisiones tomadas

- **Stack:** Python 3.11 + FastAPI + instagrapi (única opción real para IG sin Graph API formal de Meta).
- **Hosting:** Railway, root directory `apps/ig-publisher`. Nuevo servicio Railway separado del web/worker.
- **Auth web↔servicio:** HMAC-SHA256 con secret dedicado.
- **Credenciales IG:** **Supabase Vault** (encriptación at-rest) en tabla `ig_accounts`. Una fila por cuenta IG. NUNCA en env vars.
- **Sesiones IG:** Persistidas encriptadas en Supabase (no en volumen Railway, así son portables y no se pierden si Railway recrea el contenedor).
- **Bucket carruseles:** Permanece **privado**. Generamos signed URLs (TTL 1h) al momento de publicar. instagrapi descarga la imagen y postea.
- **Captions:** Usamos el sistema existente (`carousel_captions` con 3 variantes AIDA/PAS/HSC). Agregamos validación IG (≤2200 chars) y auto-selección si no hay seleccionada. Mejora de prompt para hashtags estratégicos (mix niche/medium/branded/trending) en una iteración futura — no bloquea el MVP.
- **Rate limit por cuenta:** 5 posts/24h hard cap (IG flagea >25/día), default usage Manuel = 1-2/día.
- **Cuentas IG concurrentes:** No hay otro sidecar (eliminado). Sin lock distribuido necesario.
- **Onboarding:** CLI script local que hace login + 2FA + guarda session encriptado en Supabase. Una vez por cuenta.

## Riesgos conocidos y mitigación

| Riesgo | Mitigación |
|---|---|
| IG challenge_required en cuenta nueva | Warming manual: subir 1/día las primeras 2 semanas, idealmente desde celular en paralelo |
| Session expira / IG fuerza re-login | Endpoint `/admin/refresh-session/{account_id}` + alerta en UI cuando `status='challenge'` |
| Imágenes de Supabase no descargables (signed URL expirada) | Generar signed URL justo antes de llamar a instagrapi, TTL 1h (más que suficiente para 1 post) |
| HMAC secret leak | Distinto del de cualquier otro servicio. Solo vive en Railway env + Vercel env. Rotación documentada en runbook |
| Servicio Railway down → publicación silently failed | `ig_publications.status='failed'` + `ig_publications.error` + UI muestra error. Inngest function reintenta 3 veces con backoff exponencial |

---

## Fases de implementación

### ✅ Fase 0: Recon (completada)
- DB schema mapeado, vault disponible, 3 proyectos detectados (apex, botlode, default), 5 carruseles existentes
- Patterns de migración/RLS/triggers documentados arriba

### Fase 1: DB foundation (3 migraciones)

#### 0028_ig_accounts.sql
Tabla `ig_accounts`:
```
id              uuid PK
project_id      uuid FK projects(id) ON DELETE CASCADE
user_id         uuid FK profiles(id) ON DELETE CASCADE      -- denormalizado para RLS O(1)
ig_username     text NOT NULL
display_name    text                                         -- "APEX Stack" para UI
password_secret_id   uuid FK vault.secrets(id)               -- encriptado
totp_seed_secret_id  uuid FK vault.secrets(id) NULLABLE     -- nullable (no toda cuenta tiene 2FA)
session_secret_id    uuid FK vault.secrets(id) NULLABLE     -- session_b64 actual
session_updated_at   timestamptz
status          text NOT NULL DEFAULT 'pending_session'
                CHECK (status IN ('pending_session', 'active', 'challenge', 'disabled'))
last_action_at  timestamptz
last_post_at    timestamptz
post_count_24h  int NOT NULL DEFAULT 0
post_count_24h_reset_at timestamptz NOT NULL DEFAULT NOW()
last_error      text
deleted_at      timestamptz
created_at      timestamptz NOT NULL DEFAULT NOW()
updated_at      timestamptz NOT NULL DEFAULT NOW()
UNIQUE (project_id, ig_username) WHERE deleted_at IS NULL
```

Triggers: `copy_user_id` (desde projects), `updated_at`.
RLS: SELECT/INSERT/UPDATE/DELETE solo si `user_id = auth.uid()`. **Service role bypass** para el publisher.
Helper functions:
- `ig_account_create_with_secrets(project_id, username, password, totp_seed)` SECURITY DEFINER — inserta con vault encryption
- `ig_account_update_session(account_id, session_b64)` SECURITY DEFINER — solo service role
- `ig_account_get_secrets(account_id)` SECURITY DEFINER — devuelve credenciales decifradas, solo service role

#### 0029_ig_publications.sql
Tabla `ig_publications`:
```
id              uuid PK
carousel_id     uuid FK carousel_projects(id) ON DELETE CASCADE
ig_account_id   uuid FK ig_accounts(id) ON DELETE RESTRICT  -- no borrar cuenta con publicaciones históricas
user_id         uuid FK profiles(id) ON DELETE CASCADE
caption         text NOT NULL                                -- snapshot del caption usado
status          text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','publishing','published','failed','cancelled'))
ig_media_id     text                                         -- ID que devuelve instagrapi
ig_permalink    text                                         -- https://www.instagram.com/p/...
published_at    timestamptz
attempts        int NOT NULL DEFAULT 0
last_attempt_at timestamptz
error           jsonb                                        -- { code, message, details }
inngest_run_id  text
created_at      timestamptz NOT NULL DEFAULT NOW()
updated_at      timestamptz NOT NULL DEFAULT NOW()
```

Triggers idénticos al patrón existente.
RLS: owner-only via user_id. Service role bypass.
Index en (`user_id`, `status`), (`carousel_id`).

#### 0030_carousel_projects_publish_status.sql
Agregar a `carousel_projects`:
- `last_published_at timestamptz` — última vez que se publicó este carrusel a alguna cuenta IG
- `published_count int NOT NULL DEFAULT 0` — contador (un mismo carrusel puede publicarse a varias cuentas)

### Fase 2: Python service skeleton

Estructura `apps/ig-publisher/`:
```
apps/ig-publisher/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app, lifespan, router include
│   ├── config.py                # pydantic-settings, env vars
│   ├── auth.py                  # HMAC-SHA256 dependency
│   ├── supabase_client.py       # service role client (singleton)
│   ├── accounts.py              # cargar credenciales desde DB+Vault
│   ├── ig_session.py            # login, restore, refresh, persist
│   ├── circuit_breaker.py       # per-account, in-memory + DB persisted status
│   ├── rate_limiter.py          # 5 posts/24h por cuenta
│   ├── image_downloader.py      # desde signed URLs Supabase Storage
│   ├── exceptions.py
│   ├── logging_config.py
│   └── routes/
│       ├── __init__.py
│       ├── health.py            # GET /health (sin HMAC)
│       ├── carousel.py          # POST /feed/publish-carousel
│       └── admin.py             # POST /admin/refresh-session/{id}
├── scripts/
│   └── onboard_account.py       # CLI: login interactivo + guardar en Vault
├── tests/
│   ├── test_auth.py
│   ├── test_rate_limiter.py
│   └── test_circuit_breaker.py
├── Dockerfile                   # python:3.11-slim
├── requirements.txt
├── railway.toml
├── .env.example
├── .python-version              # 3.11
├── pytest.ini
└── README.md
```

### Fase 3: Endpoints

#### `GET /health`
Sin auth. Devuelve `{ status, accounts_loaded, version }`.

#### `POST /feed/publish-carousel`
HMAC. Body:
```json
{
  "carousel_id": "uuid",
  "publication_id": "uuid",
  "ig_account_id": "uuid",
  "image_urls": ["https://...signed...", ...],
  "caption": "string",
  "first_comment": "string|null",
  "simulate_human": true
}
```

Flujo:
1. Cargar `ig_account` desde DB → desencriptar credenciales vía Vault
2. Restaurar/login session (`ig_session.py`)
3. Check rate limit (DB-side): si `post_count_24h >= 5` → 429
4. Check circuit breaker: si abierto → 503 con `cooldown_until`
5. Update `ig_publications.status='publishing'`, attempts++
6. Descargar imágenes a `/tmp/{publication_id}/slide-{i}.jpg` (instagrapi necesita paths locales)
7. Convertir/validar (1080x1350 4:5 o 1080x1080 1:1, JPEG)
8. `client.album_upload(paths, caption)` con sleep 3-15s entre acciones si `simulate_human=true`
9. Si éxito: update `ig_publications` con `media_id`, `permalink`, `status='published'`, `published_at`. Update `ig_accounts.last_post_at`, `post_count_24h++`, `last_action_at`
10. Persistir nueva session encriptada
11. Cleanup `/tmp/{publication_id}/`
12. Si `first_comment`: `client.media_comment(media_id, first_comment)` después de 5-10s
13. Devolver `{ media_id, permalink, published_at }`

Errores:
- `ChallengeRequired` / `FeedbackRequired` → status='challenge' en `ig_accounts`, circuit cooldown 48h, response 503
- `LoginRequired` → intentar re-login una vez; si falla, status='challenge', cooldown 1h
- `PleaseWaitFewMinutes` → cooldown 15min
- Otro Exception → cooldown 5min, log completo en `ig_publications.error`

#### `POST /admin/refresh-session/{account_id}` (HMAC)
Fuerza re-login. Útil cuando UI detecta `status='challenge'` y el usuario resolvió el challenge en la app de IG.

### Fase 4: Onboarding CLI

```bash
cd apps/ig-publisher
python -m scripts.onboard_account \
  --project-slug apex \
  --ig-username apex.stack \
  --display-name "APEX Stack"
```

Flujo:
1. Pide password por stdin (`getpass`)
2. Pide TOTP seed (opcional, para 2FA) — texto base32
3. Hace login con instagrapi localmente (asegura IP del usuario, no del Railway)
4. Si éxito: serializa session a base64
5. Llama RPC `ig_account_create_with_secrets()` para insertar fila + Vault entries
6. Prints el `ig_account_id` resultante

Si la cuenta ya existe (mismo project + username), pregunta si quiere actualizar credenciales.

### Fase 5: Worker integration (TypeScript)

#### Nuevo evento Inngest
`packages/inngest/src/client.ts` — agregar:
```typescript
'virus/carousel.publish.requested': {
  data: { publicationId: string; carouselId: string; igAccountId: string; userId: string };
};
'virus/carousel.publish.completed': {
  data: { publicationId: string; mediaId: string; permalink: string };
};
'virus/carousel.publish.failed': {
  data: { publicationId: string; error: string };
};
```

#### Nueva Inngest function
`apps/worker/src/functions/publish-carousel-to-ig.ts`:
1. step.run "load-publication": fetch `ig_publications` + `carousel_projects` + slides
2. step.run "build-signed-urls": para cada slide composed_path/image_path, generar signed URL (TTL 1h)
3. step.run "select-or-validate-caption": si `selected_caption` existe → usar. Si no → seleccionar la mejor (heurística: framework=hook_story_cta > pas > aida, o la primera). Validar ≤2200 chars.
4. step.run "call-publisher": HTTP POST con HMAC al sidecar. Timeout 5min.
5. step.sendEvent → `virus/carousel.publish.completed` o `.failed`
6. Retries: 3 attempts con backoff [1min, 5min, 30min]. Si 503 (circuit) → no reintentar, dejar para reintento manual

#### Cliente HTTP
`apps/worker/src/lib/ig-publisher.ts`:
```typescript
export async function publishCarousel(req: PublishCarouselReq): Promise<PublishCarouselResp> {
  const body = JSON.stringify(req);
  const signature = `sha256=${createHmac('sha256', env.IG_PUBLISHER_HMAC_SECRET).update(body).digest('hex')}`;
  const res = await fetch(`${env.IG_PUBLISHER_URL}/feed/publish-carousel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sidecar-Signature': signature },
    body,
    signal: AbortSignal.timeout(300_000),
  });
  // ... handle errors
}
```

### Fase 6: Web API + UI

#### `POST /api/carousels/[id]/publish`
Body: `{ ig_account_id: string }`
- Valida ownership del carrusel + cuenta
- Crea row en `ig_publications` con status='queued'
- Despacha evento `virus/carousel.publish.requested`
- Devuelve `{ publication_id, status: 'queued' }`

#### `GET /api/carousels/[id]/publications`
Lista publicaciones del carrusel (todas las cuentas IG donde se publicó).

#### `GET /api/ig/accounts`
Lista las `ig_accounts` del usuario, agrupadas por proyecto.

#### UI: Settings → Cuentas Instagram
Nueva ruta `apps/web/src/app/(dashboard)/dashboard/settings/instagram/page.tsx`:
- Tabla: project, username, status (badge color), last_post_at, posts_24h
- Acciones: "Onboard nueva cuenta" (instrucciones para correr CLI), "Refresh session" (cuando status=challenge), "Disable"

#### UI: Botón "Publicar en Instagram" en carousel detail
Modificar `CarouselDetailView` (apps/web/src/components/carousels/...):
- Dropdown "Publicar en..." con cuentas IG del proyecto
- Botón disabled si:
  - No hay cuentas IG configuradas para el proyecto (mostrar link a Settings)
  - Carrusel no está en status='ready'
  - Ya hay una publication 'queued' o 'publishing' para esta combinación
- Al click: POST /publish, mostrar spinner, suscribirse a realtime de `ig_publications` para esa row
- Estados visuales: queued (gray spinner), publishing (purple pulse), published (green ✓ + link), failed (red + error + retry button)

### Fase 7: Railway deploy

`apps/ig-publisher/railway.toml`:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
healthcheckPath = "/health"
healthcheckTimeout = 30
```

Volume opcional `/tmp` (efímero, OK que se pierda).

Env vars Railway:
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
IG_PUBLISHER_HMAC_SECRET=<32+ chars random>
LOG_LEVEL=INFO
PORT=8000  # Railway lo setea
```

Env vars Vercel (web + worker):
```
IG_PUBLISHER_URL=https://virus-ig-publisher.up.railway.app
IG_PUBLISHER_HMAC_SECRET=<el mismo>
```

### Fase 8: Docs

- `apps/ig-publisher/README.md` — overview, dev setup, runbook
- `docs/ig-publisher/onboarding-guide.md` — paso a paso para agregar cuenta IG nueva
- `docs/ig-publisher/troubleshooting.md` — errores comunes (challenge, rate limit, session expired)
- Update `.env.example` raíz con `IG_PUBLISHER_*` vars

---

## Plan de testing (post-implementación)

1. **DB unit:** los helpers `ig_account_*` funcionan vía SQL directo
2. **Python unit:** HMAC, rate limiter, circuit breaker
3. **Integration local:**
   - Onboard `apex.stack` con CLI
   - Levantar publisher local (`uvicorn`)
   - Llamar manualmente con curl + HMAC firmado a `/feed/publish-carousel` con un carrusel real
   - Verificar post en IG real
4. **Production smoke:**
   - Deploy Railway
   - Publicar primer carrusel real desde UI
   - Si OK, repetir con segunda cuenta (botlode después de crear `botlode.oficial` IG)

## Out of scope (futuro)

- Stories / Reels / posts no-carrusel
- Programación (publicar a una hora específica) — los carruseles se publican on-demand
- Analytics post-publish (likes/comments retrieval)
- Carruseles a otras plataformas (LinkedIn, Twitter)
- Caption upgrade con framework IG-específico (mejora futura, no bloquea)
