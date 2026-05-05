---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 3
depende-de: [T3-P01, T3-P02]
file-ownership:
  - packages/remotion/src/templates/listicle/
duracion-estimada: 45 min
---

# T3-P06 — Template "Listicle / Tools list" (30-50s)

## Contexto

Formato listicle = "5 cosas que..." / "5 shortcuts de VS Code que nadie usa" (proyecto.md hooks #4, #11, #23). Estructura:
- 0-2s: hook con número grande ("5 shortcuts de VS Code que nadie te enseñó")
- 2-5s: setup
- 5-45s: items 1 a N, cada uno ~6-8s con counter visible
- 45-50s: cliffhanger sobre el item top + CTA

Lee:
- `proyecto.md` §1 (Tools listicle, Tier list), §3 hooks #4 #11 #23

## Tarea

Implementá `packages/remotion/src/templates/listicle/` con estructura estándar.

### Características visuales

- **Counter grande siempre visible**: `<Counter current={N} total={5} />` en esquina superior derecha durante todo el video. Cambia con animación spring.
- **Cada item tiene su sub-card**: header del item (#1, #2, ...), nombre, demo o screenshot, una frase de valor.
- **Pattern interrupt** entre items: flash + cambio de fondo accent al item siguiente.
- **Item cliffhanger**: el último item se promete pero NO se muestra completo. CTA: "Comentá NUMERO 5 y te lo cuento por DM" (genera engagement masivo).
- **Final card**: lista compacta de los 4 items revelados + el #5 oculto con texto blureado.

### Schema additional

```ts
export const listicleSchema = videoInputSchema.extend({
  listicle: z.object({
    title: z.string(),                // "5 shortcuts de VS Code"
    items: z.array(z.object({
      rank: z.number(),
      name: z.string(),
      tagline: z.string(),
      demoCodeSnippet: z.object({ language: z.string(), code: z.string() }).optional(),
      screenshotUrl: z.string().url().optional(),
      hidden: z.boolean().default(false),       // last one true
    })),
  }),
});
```

### Sample data

Caso "5 VS Code extensions que 10x'd mi productividad" con items realistas (GitLens, Error Lens, Path Intellisense, Console Ninja, y el 5° hidden = "Cline" o similar).

## Output esperado

Template `listicle` registrado y renderizable. Sample preview correcto en Studio.
