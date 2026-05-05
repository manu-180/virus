# Seed: apex-dev

Proyecto seed preconfigurado para el primer login de Manuel. T2-P08 lo consume en `getApexDevSeed()` para crear el proyecto inicial sin que Manuel tenga que configurar nada.

## Origen de cada sección

| Sección | Fuente |
|---------|--------|
| `patterns.json → hooks` | `proyecto.md §3` — 30 hooks probados, con engagement empírico de Fireship, Theo y cuentas 100K+ |
| `patterns.json → formats` | `proyecto.md §1` — 15 formatos con duración óptima por plataforma |
| `patterns.json → topics` | `proyecto.md §5` — Top 25 temas con mayor engagement 2025-2026 |
| `patterns.json → pacing` | `proyecto.md §2` — Anatomía segundo a segundo: velocidad, cortes, LUFS |
| `patterns.json → visualElements` | `proyecto.md §2` — Elementos visuales con peso de retención documentado |
| `patterns.json → hashtags/captions` | `proyecto.md §6` — Guía de descripciones HVCT con plantillas copy-paste |
| `brand.json` | `APEX_next/ANALISIS.md` — Secciones SERVICIOS, PROYECTOS, SOBRE MÍ |

## Cómo regenerar el seed

Si se actualiza la research en `proyecto.md` o los datos de marca en `ANALISIS.md`:

1. Editar `patterns.json` y/o `brand.json` directamente con los nuevos datos.
2. Actualizar `sample-patterns.md` y `sample-brand.md` para mantenerlos sincronizados.
3. Correr `pnpm test viral/seeds/` para verificar idempotencia.
4. Correr `pnpm typecheck` para verificar tipos.

No hay script de regeneración automática: estos archivos son assets versionados que se actualizan manualmente cuando cambia la research.

## Disclaimer

Este seed sirve como:
- **Ejemplo funcional** para que Manuel pruebe el botón "Generar" desde el día 1.
- **Plantilla descargable** (`sample-patterns.md`, `sample-brand.md`) para que clientes armen su propio archivo.
- **Fallback** si un proyecto no tiene patterns configurados.

El proyecto real de APEX puede divergir de este seed. Los datos de APEX en producción se gestionan desde la UI como cualquier otro proyecto.

## Estructura de archivos

```
apex-dev/
├── patterns.json       — ProjectPatterns validado contra Zod schema
├── brand.json          — ProjectBrand validado contra Zod schema
├── sample-patterns.md  — Versión markdown idempotente de patterns.json
├── sample-brand.md     — Versión markdown idempotente de brand.json
└── README.md           — Este archivo
```

## IDs estables

Los IDs (`h-001` a `h-030`, `f-001` a `f-015`, `t-001` a `t-025`) son estables y pueden usarse como referencias en código o en la DB. Al instanciar el seed, reemplazar `projectId: '__seed_apex_dev__'` por el UUID real del proyecto creado.
