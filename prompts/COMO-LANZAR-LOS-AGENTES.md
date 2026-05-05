# Cómo lanzar los agentes — Manuel paso a paso

> Este archivo te dice **exactamente** qué decirle a Claude Code para ejecutar cada tanda en paralelo.
> Plan actualizado: ahora soporta **multi-proyecto**. Cada tanda tiene prompts adicionales para el sistema de proyectos.

---

## ANTES DE LANZAR LA TANDA 1

Hacé el setup manual:

1. Abrí los 3 archivos:
   - `prompts/tanda-1-foundation/T1-P05-elevenlabs-setup.md`
   - `prompts/tanda-1-foundation/T1-P06-aws-lambda-setup.md`
   - `prompts/tanda-1-foundation/T1-P07-supabase-vercel-setup.md`
2. Creá las cuentas que indica cada uno y completá `.env.local`.
3. Cuando tengas TODAS las variables completas, seguí abajo.

(Igual podés lanzar la Tanda 1 al mismo tiempo que hacés el setup manual — los agentes generan código que NO necesita las credenciales todavía.)

---

## TANDA 1 — FOUNDATION (8 agentes en paralelo)

Pegale a Claude Code **un solo mensaje** con esto:

```
Lanzá en paralelo 8 agentes especializados para ejecutar estos prompts. Cada agente lee el archivo del prompt indicado y produce el código allí especificado. Importante: cada agente trabaja en su file-ownership disjunto, no se pisan.

1. Agente typescript-pro → C:\MisProyectos\Armagedon\virus\prompts\tanda-1-foundation\T1-P01-monorepo-init.md (modelo: claude-sonnet-4-6)
2. Agente database-architect → T1-P02-supabase-schema.md (modelo: claude-opus-4-7)
3. Agente design-system-architect → T1-P03-design-system.md (modelo: claude-sonnet-4-6)
4. Agente ai-engineer → T1-P04-viral-framework.md (modelo: claude-opus-4-7[1m])  [motor genérico, data-driven]
5. Agente general-purpose → T1-P05-elevenlabs-setup.md (modelo: claude-sonnet-4-6)
6. Agente cloud-architect → T1-P06-aws-lambda-setup.md (modelo: claude-sonnet-4-6)
7. Agente general-purpose → T1-P07-supabase-vercel-setup.md (modelo: claude-sonnet-4-6)
8. Agente ai-engineer → T1-P08-default-project-seed.md (modelo: claude-opus-4-7)  [seed APEX-dev]

Cada agente debe leer SU prompt + los archivos de referencia que el prompt menciona, y producir EXACTAMENTE lo que el prompt pide. Cuando todos terminen, reportame el estado.
```

Tiempo esperado: 60-90 minutos.

**Nota de orden**: T1-P08 depende lógicamente de los tipos de T1-P04 (`packages/shared/src/viral/types.ts`). Si arranca antes y T1-P04 no terminó, T1-P08 puede crear interfaces locales y luego validar contra los reales en post-merge. Alternativa más segura: lanzar primero P01-P07, esperar que P04 cierre, y luego P08 solo.

---

## TANDA 2 — BACKEND CORE (9 agentes en paralelo)

Después de que Tanda 1 termine:

```
Lanzá en paralelo 9 agentes para Tanda 2 (backend core):

1. backend-architect → tanda-2-backend-core/T2-P01-supabase-clients.md (sonnet-4.6)
2. frontend-developer → T2-P02-auth-flow.md (sonnet-4.6)
3. ai-engineer → T2-P03-claude-integration.md (opus-4.7)
4. backend-architect → T2-P04-elevenlabs-integration.md (sonnet-4.6)
5. backend-architect → T2-P05-captions-integration.md (sonnet-4.6)
6. backend-architect → T2-P06-storage-helpers.md (sonnet-4.6)
7. backend-architect → T2-P07-inngest-setup.md (sonnet-4.6)
8. backend-architect → T2-P08-project-crud.md (sonnet-4.6)            [project CRUD + upload]
9. ai-engineer → T2-P09-pattern-parser.md (opus-4.7)                  [parser md/json/pdf/img]

Cada agente lee su prompt y construye según file-ownership. Cuando terminen, reportame.
```

Tiempo esperado: 90-120 minutos.

**TIP:** Tanda 3 es independiente de Tanda 2. Las podés lanzar **simultáneamente** en mensajes separados (pero recomiendo de a una para no confundirte con outputs).

---

## TANDA 3 — REMOTION TEMPLATES (8 agentes en paralelo)

Sin cambios respecto al plan original — los templates son **project-agnostic** (reciben `themeColor`, `script`, `audio_url` como props).

```
Lanzá en paralelo 8 agentes para Tanda 3 (remotion templates):

1. frontend-developer → T3-P01-remotion-base.md (opus-4.7)
2. frontend-developer → T3-P02-shared-components.md (sonnet-4.6)
3. frontend-developer → T3-P03-template-tip.md (sonnet-4.6)
4. frontend-developer → T3-P04-template-hot-take.md (sonnet-4.6)
5. frontend-developer → T3-P05-template-speed-build.md (sonnet-4.6)
6. frontend-developer → T3-P06-template-listicle.md (sonnet-4.6)
7. frontend-developer → T3-P07-template-story-bug.md (sonnet-4.6)
8. frontend-developer → T3-P08-template-comparison.md (sonnet-4.6)

Importante: T3-P02 a P08 dependen de T3-P01. Si lanzás los 8 a la vez, los demás van a tener que reintentar cuando T3-P01 termine. Alternativa: lanzar primero T3-P01 y T3-P02 (paralelo), después los 6 templates.
```

Tiempo esperado: 90-120 min.

---

## TANDA 4 — FRONTEND DASHBOARD (10 agentes en paralelo)

Requiere T2 finalizada.

```
Lanzá en paralelo 10 agentes para Tanda 4 (dashboard UI):

1. frontend-developer → T4-P01-app-shell.md (sonnet-4.6)
2. frontend-developer → T4-P02-home-dashboard.md (sonnet-4.6)
3. frontend-developer → T4-P03-ideas-pipeline.md (sonnet-4.6)
4. frontend-developer → T4-P04-calendar.md (sonnet-4.6)
5. frontend-developer → T4-P05-performance.md (sonnet-4.6)
6. frontend-developer → T4-P06-settings.md (sonnet-4.6)
7. frontend-developer → T4-P07-onboarding.md (sonnet-4.6)
8. frontend-developer → T4-P08-projects-list.md (sonnet-4.6)            [/projects + switcher]
9. frontend-developer → T4-P09-project-create-wizard.md (sonnet-4.6)    [/projects/new]
10. frontend-developer → T4-P10-project-detail.md (sonnet-4.6)          [/projects/[slug] + GENERAR]

T4-P02..P07 + T4-P08..P10 dependen de T4-P01 (shell). Lanzar P01 primero o aceptar que los demás esperan.
T4-P10 además depende de T5-P05 para llamar al endpoint de generación — si T5 no terminó, el botón muestra "endpoint no disponible" y se completa después.
```

Tiempo: 100 min.

---

## TANDA 5 + TANDA 6 (en paralelo entre sí)

Después de T4. Mensaje único:

```
Lanzá en paralelo 9 agentes para Tandas 5 y 6:

Tanda 5 (render pipeline):
1. backend-architect → T5-P01-remotion-lambda-client.md (sonnet-4.6)
2. backend-architect → T5-P02-orchestrator.md (opus-4.7-1M)
3. backend-architect → T5-P03-realtime-channels.md (sonnet-4.6)
4. backend-architect → T5-P04-rate-limiting-quotas.md (sonnet-4.6)
5. backend-architect → T5-P05-project-aware-orchestrator.md (opus-4.7-1M)   [endpoint /api/generate]

Tanda 6 (viral engine):
6. ai-engineer → T6-P01-trend-detector.md (sonnet-4.6)
7. ai-engineer → T6-P02-hook-ab-tester.md (opus-4.7)
8. ai-engineer → T6-P03-feedback-loop.md (opus-4.7-1M)
9. ai-engineer → T6-P04-anti-repetition.md (opus-4.7-1M)                    [hash + similitud]
```

Tiempo: 90-120 min.

**Nota de dependencia**: T5-P05 depende lógicamente de T6-P04 (consume `suggestWithAntiRepeat`). Si T6-P04 no terminó, T5-P05 puede usar `engine.antiRepeat()` solo (hash) y se le agrega la capa semántica en post-merge.

---

## TANDA 7 — QA + DEPLOY (4 agentes en paralelo)

Última tanda:

```
Lanzá en paralelo 4 agentes para Tanda 7:

1. test-automator → T7-P01-e2e-tests.md (sonnet-4.6)
2. deployment-engineer → T7-P02-deploy-vercel-supabase.md (sonnet-4.6)
3. observability-engineer → T7-P03-observability.md (sonnet-4.6)
4. docs-architect → T7-P04-runbook-docs.md (sonnet-4.6)
```

Tiempo: 60 min.

**Nota multi-proyecto**: los tests E2E de T7-P01 deben cubrir el flow completo: crear proyecto → subir 2 archivos → esperar parseo → click generar → ver video listo + caption. Si T7-P01 no fue actualizado para esto, agregá ese caso al briefing del agente.

---

## DESPUÉS DE TODO

1. Correr `pnpm install` desde root.
2. `pnpm typecheck` debe pasar.
3. Hacer el voice clone real (`/onboarding` o `/settings/voice`).
4. Primer login → automáticamente se crea el proyecto seed APEX-dev.
5. Probar el botón "Generar video" en `/projects/apex-dev` → en 2-4 min hay un MP4 + caption listos.
6. Crear tu segundo proyecto (Assistify, ChatBot Pro, etc.) desde `/projects/new` con tus propios archivos.

---

## SI ALGO FALLA

- Cada prompt es **autocontenido** y reproducible. Si un agente fracasa, podés re-lanzarlo solo con `Agent({ subagent_type, prompt: "lee y ejecutá X.md" })`.
- Si chocan archivos: revisá el `file-ownership` declarado en el header de cada prompt. Si dos prompts tienen overlap, era un error de planificación — avisá y lo corregimos.
- Cuestiones de credenciales / keys: NO le des keys a los agentes. Que lean `.env.example` y dejen los placeholders.
- Si el parser de archivos del proyecto (T2-P09) falla en runtime con un archivo real, mirá el log de Inngest, copiá el error, y pegalo en una nueva sesión Claude pidiendo "fix parser para este caso".

---

## TOTAL ESTIMADO DE COSTO DE TOKENS

(Aproximado — depende mucho del tamaño de cada agente)

| Tanda | Modelo dominante | Tokens estimados | Costo USD aprox |
|-------|-----------------|-------------------|-----------------|
| T1 | Sonnet 4.6 + 1 Opus 1M + 1 Opus | ~750K in / 200K out | ~$8 |
| T2 | Sonnet 4.6 + 2 Opus | ~900K in / 280K out | ~$10 |
| T3 | Sonnet 4.6 | ~500K in / 200K out | ~$3 |
| T4 | Sonnet 4.6 | ~750K in / 320K out | ~$5 |
| T5 | Sonnet + 2 Opus 1M | ~700K in / 220K out | ~$13 |
| T6 | Mixed + 1 Opus 1M nuevo | ~550K in / 220K out | ~$8 |
| T7 | Sonnet 4.6 | ~300K in / 100K out | ~$2 |
| **Total** | | | **~$49 USD** |

(Con prompt caching activado y reutilización de contexto, puede bajar a $30.)

---

## DEPENDENCIAS DE LOS PROMPTS NUEVOS (resumen visual)

```
T1-P02 (schema multi-proyecto)  ──┐
T1-P04 (motor genérico)           ├──► T2-P08 (project CRUD)  ──► T4-P08/09/10
T1-P08 (seed APEX-dev)            │                         ──► T5-P05
                                  └──► T2-P09 (parser)       ──► T5-P05

T6-P04 (anti-repetition) ──► T5-P05 (orchestrator project-aware) ──► T4-P10 (botón Generar)
```

Los prompts nuevos respetan la regla de file-ownership disjunto dentro de cada tanda → todos lanzables en paralelo dentro de su tanda.
