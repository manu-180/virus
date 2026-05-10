# Tanda 5.18 — Cost tracking: registrar costos de carruseles en `usage_records`

## Contexto

La tabla `usage_records` (creada por migration `0011_usage_tracking.sql` y extendida en `0016_usage_records_extend.sql`) ya registra costos de videos por step (Gemini, ElevenLabs, Claude, Luma). Agregamos las nuevas categorías para carruseles.

Goal: que Manuel pueda ver "cuánto me costó este carrusel" y "cuánto gasté este mes" en una vista de costos.

## Pasos

1. **Leer:**
   - `packages/db/migrations/0011_usage_tracking.sql` y `0016_usage_records_extend.sql` (schema actual).
   - `packages/shared/src/tokens/` (helpers existentes que loggean costos).
   - Cómo lo usan funciones del worker actuales (busca `usage_records` en `apps/worker/src/`).

2. **Migration `packages/db/migrations/0023_usage_records_carousel.sql`** (si hace falta):
   - Si la tabla ya soporta `subject_type` (e.g. 'video' | 'carousel'), no hace falta migration.
   - Si no, `alter table public.usage_records add column subject_type text` y `subject_id uuid` (probablemente ya existen — verificar con `\d usage_records`).

3. **Helpers en `packages/shared/src/carousel/cost.ts`** (extender):
   - `recordCarouselUsage(args: { supabase; userId; carouselId; provider: 'gemini'|'claude'|'sharp'; operation: string; quantity: number; costCents: number })` que inserta una row en `usage_records`.

4. **Llamar el helper desde:**
   - `image-provider.ts` (Tanda 5): después de cada call exitosa a Gemini.
   - `composer.ts` (Tanda 6): por cada slide compuesto (cost ~ 0, pero contar para métricas — `provider='sharp'`, `costCents=0` o un proxy).
   - `generate-carousel-plan.ts` y `generate-carousel-caption.ts` (Tandas 8-9): después de cada call a Claude — usa estimador token-based del helper existente.

5. **Vista de costos**:
   - Agregá a la página de detalle del carrusel (Tanda 12) una sección "Detalles" colapsable con:
     - Costo total = suma de `usage_records WHERE subject_type='carousel' AND subject_id=carousel.id`.
     - Breakdown por provider.
     - Tiempo de generación = `updated_at - created_at`.
   - Endpoint `GET /api/carousels/[id]/cost` que agrega.

6. **Vista mensual**:
   - En `/dashboard/settings/usage` (existe? — si sí, extendelo; si no, mini-page nueva): mostrar "este mes en carruseles: $X.XX, total: $Y.YY". Reusar query group by mes existente.

7. **Test manual**:
   - Generar un carrusel.
   - Query `select * from usage_records where subject_id='<id>'` debe devolver ~10 rows (8 imágenes + 1 plan + 3 captions ≈ 12).
   - Suma debe estar entre $0.18 y $0.30 USD.

8. **Commit:**
   ```
   feat(carousel): track AI usage and costs per carousel for monitoring and billing visibility
   ```

## Constraints

- **NO** loggear costos fuera de steps de Inngest — duplica si re-ejecuta. Loggea dentro del mismo `step.run` que hace la call.
- Costos en cents (int) para evitar float drift.
- Los costos de Sharp/composer son ~0 (CPU local) — registrar `costCents=0` para tener registro pero sin impactar total.

## Done cuando

- Cada carrusel tiene rows en `usage_records`.
- UI muestra costo total.
- Commit hecho.
