---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 3
depende-de: [T3-P01, T3-P02]
file-ownership:
  - packages/remotion/src/templates/hot-take/
duracion-estimada: 60 min
---

# T3-P04 — Template "Hot Take / Opinión polémica" (20-40s)

## Contexto

Formato de **opinión contrarian** (proyecto.md hooks #2, #5, #7, #17, #24). Estructura:
- 0-2s: hook fuerte ("Cursor mató a GitHub Copilot. Y nadie está hablando de esto.")
- 2-8s: contexto/setup ("6 meses usando ambos...")
- 8-25s: argumento + evidencia visual (screenshots de tweets, métricas, side-by-side)
- 25-32s: punchline/conclusión
- 32-40s: CTA polémica ("¿Cuál usás vos? CURSOR / COPILOT / CLAUDE")

Lee:
- `proyecto.md` §1 (Roast/Hot take), §3 hooks contrarian
- `T3-P03` para entender la estructura del template (mismo patrón).

## Tarea

Implementá `packages/remotion/src/templates/hot-take/` con la misma estructura que T3-P03:
- `index.tsx`, `schema.ts`, `defaults.ts`, `sample.json`.

### Diferencias visuales con `tip`

- **HookCard variant `glitch`** en los primeros 2s (RGB shift). Más agresivo.
- **Citas/quotes** como elemento visual: cuando se menciona un tweet o opinión, mostrar un mock de tweet (avatar + handle + texto). Componente nuevo: `<TweetMock />` que va en `components/tweet-mock/`.
- **Comparación side-by-side** durante el desarrollo (split screen vertical 50/50).
- **Punchline** con screen shake leve (translate Y/X de ±5px en 0.3s).
- **CTA con encuesta**: 3 botones grandes (CURSOR, COPILOT, CLAUDE) con counter falso animado para generar polémica en comments.
- Música default: `synthwave` o `phonk` (más energía).

### Componente extra

`components/tweet-mock/` — card que simula un tweet:
```tsx
interface TweetMockProps {
  avatar?: string;       // url
  name: string;
  handle: string;
  text: string;
  themeColor: string;
}
```

### Sample data

Hot take realista: "Cursor mató a Copilot" o "Borrá Redux ahora mismo" (hook #2 viral).

## Output esperado

Template `hot-take` registrado y renderizable. Verificación igual a T3-P03.
