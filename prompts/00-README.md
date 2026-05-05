# PROYECTO VIRUS — Plan Maestro

> Sistema autónomo y **multi-proyecto** de generación de videos virales verticales para Instagram Reels / TikTok / YouTube Shorts.
> Propietario: Manuel Navarro (APEX) — Buenos Aires, Argentina.
> Stack: Next.js 16 + Supabase + Remotion + Remotion Lambda + ElevenLabs + Claude API + Inngest.

---

## ¿QUÉ HACE EL SISTEMA?

Virus es una plataforma donde Manuel crea **Proyectos** (uno por nicho/producto: APEX, Assistify, ChatBot Pro, etc.) y dentro de cada proyecto genera videos virales con un solo botón.

Cada **Proyecto** tiene:
- 🧬 **Patrones virales del nicho** — archivo (markdown/JSON/PDF/imágenes) que describe qué hace virales a los videos de ESE tema (hooks, formatos, ganchos visuales, ritmo, CTAs típicos).
- 🏷️ **Información del producto/marca** — archivo (markdown/JSON/PDF/imágenes) con todo lo que hay que saber del producto: features, audiencia, voz, value props, casos de uso, USPs, datos duros.
- 📚 **Historial de videos generados** — para evitar repetir hooks/temas/ángulos en ventana corta.
- 🎨 **Tema visual** (color de acento, voz clonada opcional, idioma).
- 🎬 **Botón "Generar video"** — un click → idea + script + audio + render + caption listos para subir.

### Flujo de uso de Manuel

```
1. /projects → "+ Nuevo Proyecto"
2. Subir archivo de patrones virales (drag&drop) + archivo de info del producto
3. Configurar voz, color, idioma (opcional)
4. /projects/[apex] → "Generar video" → 2-4 minutos → MP4 + caption listos
5. Descargar video, copiar caption, publicar
6. Volver a clickear "Generar" cuantas veces quiera. El sistema NO repetirá hooks/ángulos recientes.
7. Crear más proyectos: /projects → "+ Nuevo Proyecto" para Assistify, ChatBot, etc.
```

### Pipeline interno (por click de "Generar")

1. **Idea generator** lee el perfil del proyecto (patrones + info) + historial reciente y propone hook/ángulo/formato no repetidos.
2. **Script writer** combina patrones del nicho con value props del producto.
3. **Audio synthesis** (ElevenLabs) con voz clonada del proyecto.
4. **Captions** (AssemblyAI) word-level.
5. **Render** (Remotion Lambda) con template que mejor matchea el formato.
6. **Caption + hashtags** generados según patrones del nicho.
7. Video listo: estado `ready_to_publish`. Manuel descarga + copia caption + sube.

---

## ESTRUCTURA DE TANDAS (paralelización)

Cada **tanda** agrupa prompts que pueden ejecutarse **en paralelo** sin pisarse (file ownership disjunto).
Las tandas se ejecutan **secuencialmente** entre sí (T2 depende de T1, T4 depende de T2, etc.).

```
tanda-1-foundation/        ← arquitectura, schema multi-proyecto, design system, motor genérico de patrones
tanda-2-backend-core/      ← auth, claude, eleven, captions, queue, project CRUD + parser de patrones
tanda-3-remotion-templates/← 6 templates de video + componentes compartidos (agnósticos al nicho)
tanda-4-frontend-dashboard/← UI premium con login, project switcher, wizard de creación, project detail
tanda-5-render-pipeline/   ← orchestrator project-aware que une script → audio → captions → render
tanda-6-viral-engine/      ← analizador de tendencias + feedback loop + anti-repetición por proyecto
tanda-7-qa-deploy/         ← tests, deploy, onboarding, runbook
```

### Dependencias entre tandas

```
T1 ──┬─► T2 ──┬─► T4 ──┐
     │        │        ├─► T7
     └─► T3 ──┴─► T5 ──┘
                  │
                  └─► T6
```

- **T1 (foundation):** sin dependencias. Todo en paralelo.
- **T2 (backend core):** requiere T1 finalizada.
- **T3 (remotion templates):** requiere T1 (design tokens). En paralelo con T2.
- **T4 (frontend dashboard):** requiere T2.
- **T5 (render pipeline):** requiere T2 + T3.
- **T6 (viral engine):** requiere T2. Paralelo con T5.
- **T7 (qa + deploy):** requiere T4 + T5 + T6.

Dentro de cada tanda, los prompts ya están con **file ownership** disjunto: podés lanzar todos sus agentes simultáneamente sin conflictos.

### Cantidad de prompts por tanda (con mejoras multi-proyecto)

| Tanda | Prompts | Notas |
|-------|---------|-------|
| T1 | 8 (P01-P08) | +T1-P08 seed-data del proyecto default "APEX dev" |
| T2 | 9 (P01-P09) | +T2-P08 project CRUD, +T2-P09 parser de patrones |
| T3 | 8 (P01-P08) | sin cambios — los templates son project-agnostic |
| T4 | 10 (P01-P10) | +T4-P08 projects list, +T4-P09 wizard, +T4-P10 detail |
| T5 | 5 (P01-P05) | +T5-P05 orchestrator project-aware |
| T6 | 4 (P01-P04) | +T6-P04 anti-repetición por proyecto |
| T7 | 4 (P01-P04) | sin cambios estructurales (los tests cubren multi-project) |

---

## MULTI-PROYECTO — concepto core

> Un mismo Manuel puede tener N proyectos. Cada proyecto es una "fábrica de videos" autocontenida con sus propios patrones y data.

### Tipos de archivos por proyecto

Cada proyecto sube **dos archivos** mínimos al crearse:

#### 1. `viral-patterns.{md|json|pdf}` — qué hace virales a los videos del nicho

Manuel investiga (o pide a Claude) y arma un archivo con la estructura sugerida:

```markdown
# Patrones virales — Nicho: ChatBots / IA conversacional

## Hooks que funcionan
- "Tu chatbot está perdiendo X clientes por hora"
- "Hice un chatbot en 60 segundos que..."
- ...

## Formatos que viralizan
- Antes/Después de implementar chatbot (15-25s)
- Speed-build de un flow conversacional (20-30s)
- Hot-take: "los chatbots de [empresa] son..." (12-18s)

## Pacing y ritmo
- Cortes cada 2-4s
- Audio acelerado 1.15x
- Captions grandes amarillas

## CTAs típicos
- "comentá CHATBOT"
- "link en bio"

## Hashtags por plataforma
- Reels: #chatbot #ia #automation ...
- Tiktok: #ai #chatgpt ...
```

(El sistema acepta también JSON estructurado y PDFs/imágenes que se procesan con Claude vision.)

#### 2. `project-info.{md|json|pdf}` — toda la info de tu producto/servicio

```markdown
# APEX — Servicios de desarrollo de software

## Quiénes somos
APEX es un estudio de desarrollo de apps y webs en Argentina liderado por Manuel...

## Servicios
- Apps Flutter desde $X
- Webs Next.js desde $Y
- ChatBots integrados a WhatsApp

## Audiencia objetivo
Founders LATAM 25-45, ya validaron MVP, no son técnicos.

## Voz de marca
Directo, sin BS, técnico pero accesible.

## Casos de éxito
- App "Oficios App" — 10K+ usuarios en 6 meses
- Web "FrostMint" — ROAS 3.2x

## CTAs preferidos
- WhatsApp +54 9 11 ...
- apex-dev.com/cotizar
```

Ambos archivos se almacenan en **Supabase Storage**, se parsean al subirse (pipeline en T2-P09) y dejan estructuras tipadas en `project_patterns` y `project_brand` que el motor de generación consume en cada video.

### Re-suba de archivos sin pérdida

Cuando Manuel actualiza el archivo de patrones o de marca, el sistema:
1. Versiona el archivo en Storage (`projects/{id}/patterns/v3.md`).
2. Re-parsea y actualiza las estructuras.
3. NO borra el historial de videos generados con versiones anteriores.

---

## CONVENCIÓN DE CADA PROMPT

Cada archivo `T{n}-P{nn}-{slug}.md` tiene este header:

```
---
modelo: opus-4.7 | opus-4.7-1M | sonnet-4.6
modelo-id: claude-opus-4-7 | claude-opus-4-7[1m] | claude-sonnet-4-6
agente: backend-architect | frontend-developer | typescript-pro | etc.
tanda: 1
depende-de: [] | [T1-P01, T2-P03]
file-ownership:
  - apps/web/src/app/(auth)/...
  - packages/db/...
duracion-estimada: 30-90 min
---
```

Y el cuerpo del prompt es **autocontenido**: cualquier agente nuevo puede ejecutarlo sin contexto adicional.

---

## ¿QUÉ MODELO USO?

| Caso | Modelo | ID |
|------|--------|----|
| Implementar componente UI, hook, API route, migration | **Sonnet 4.6** | `claude-sonnet-4-6` |
| Diseñar schema, decidir arquitectura, prompt engineering | **Opus 4.7** | `claude-opus-4-7` |
| Cargar todo el research + código existente + arquitectura simultáneamente | **Opus 4.7 1M** | `claude-opus-4-7[1m]` |

**Regla de costo:** defaultea Sonnet 4.6. Subí a Opus 4.7 solo cuando el prompt explícitamente lo pida ("razonar / decidir / diseñar"). Opus 4.7 1M solo en los prompts marcados (T1-P04, T5-P02, T5-P05, T6-P02, T6-P03, T6-P04).

---

## CRONOGRAMA SUGERIDO (sesiones de Claude Code)

Asumiendo que vos lanzás los agentes en paralelo dentro de cada tanda:

| Tanda | Prompts | Tiempo wall-clock |
|-------|---------|-------------------|
| T1 | 8 en paralelo | 60-90 min |
| T2 | 9 en paralelo | 90-120 min |
| T3 | 8 en paralelo | 90-120 min (mismo tiempo que T2) |
| T4 | 10 en paralelo | 100 min |
| T5 | 5 en paralelo | 90-120 min |
| T6 | 4 en paralelo | 90 min (mismo tiempo que T5) |
| T7 | 4 en paralelo | 60 min |

**Total realista:** 9-13 horas de trabajo de agentes (1-2 fines de semana o repartido en una semana).

---

## SETUP MANUAL ANTES DE EMPEZAR (que TÚ tenés que hacer)

Hay 3 cosas que requieren intervención humana (cuentas, tarjeta, OAuth). Las dejé documentadas en:

- `tanda-1-foundation/T1-P05-elevenlabs-setup.md` (cuenta + voice clone)
- `tanda-1-foundation/T1-P06-aws-lambda-setup.md` (AWS account + IAM para Remotion Lambda)
- `tanda-1-foundation/T1-P07-supabase-vercel-setup.md` (proyectos Supabase + Vercel)

Cada uno tiene una **guía paso a paso** que te lleva de cero a credenciales en `.env.local`. Total: ~30 min de tu tiempo.

Adicional: NO tenés que armar los archivos de patrones/info ahora. El sistema viene con un **proyecto seed "APEX-dev"** preconfigurado (T1-P08) para que pruebes el botón "Generar" desde el día 1.

---

## ARCHIVOS DE REFERENCIA (consultar siempre)

- `proyecto.md` — research de virales (formatos, hooks, plataformas, audio, descripciones) — sirve como **fuente del seed APEX-dev** y como template del archivo `viral-patterns.md` que sube cada proyecto.
- `C:\MisProyectos\APEX\APEX_next\ANALISIS.md` — referencia visual y de marca de Manuel.
- `prompts/00-ARCHITECTURE.md` — decisiones técnicas detalladas (incluye modelo multi-proyecto).
- `prompts/00-DESIGN-TOKENS.md` — paleta, tipografía, espaciados (heredados de APEX).

---

## SIGUIENTE PASO

1. Leé `00-ARCHITECTURE.md`.
2. Hacé el setup manual de T1-P05, T1-P06, T1-P07 (las 3 guías, ~30 min total).
3. Lanzá la tanda 1 en paralelo (8 agentes en un solo mensaje — ver `COMO-LANZAR-LOS-AGENTES.md`).
4. Cuando T1 termine, lanzá T2 y T3 en paralelo.
5. Después T4. Después T5+T6 en paralelo. Finalmente T7.
6. Probá el botón "Generar" en el proyecto seed APEX-dev. Si funciona, creá tu segundo proyecto (Assistify o ChatBot) y subí los 2 archivos.
