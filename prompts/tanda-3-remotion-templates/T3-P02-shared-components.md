---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 3
depende-de: [T3-P01]
file-ownership:
  - packages/remotion/src/components/captions/
  - packages/remotion/src/components/code-block/
  - packages/remotion/src/components/counter/
  - packages/remotion/src/components/hook-card/
  - packages/remotion/src/components/cta-card/
  - packages/remotion/src/components/transitions/
  - packages/remotion/src/components/index.ts
duracion-estimada: 90 min
---

# T3-P02 — Componentes compartidos para todos los templates de video

## Contexto

Los 6 templates de video (T3-P03..P08) comparten estos building blocks:

1. **Captions** — texto sincronizado palabra por palabra, color highlight (amarillo o verde).
2. **Code block** — bloque de código con syntax highlighting + animación de typing.
3. **Counter** — "1/5, 2/5..." animado para listicles.
4. **Hook card** — card grande con texto del hook y entrada animada.
5. **CTA card** — card final con call to action + handle del usuario.
6. **Transitions** — wipe, glitch, zoom punch entre segments.

Lee:
- `prompts/00-DESIGN-TOKENS.md`
- `proyecto.md` §2 (elementos visuales que aumentan retención)
- `packages/remotion/src/lib/types.ts` (tipos de input)

## Tarea

### 1. `<Captions />` (componente más importante)

```tsx
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useTokens } from '@/lib/use-tokens';

interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

interface CaptionsProps {
  words: Word[];
  themeColor: string;
  style?: 'highlight-word' | 'wipe-line' | 'pop-word';
  position?: 'top' | 'middle' | 'bottom';
  maxWordsPerLine?: number;
}

export const Captions: React.FC<CaptionsProps>;
```

Comportamiento por estilo:

- **highlight-word** (default): muestra 3-5 palabras de la línea actual; la palabra siendo dicha se highlightea en `themeColor` (o amarillo `#FFD400`); transiciona al siguiente set cada ~1.5s.
- **wipe-line**: línea entera se "wipea" de izq a der mientras se dice.
- **pop-word**: cada palabra hace un pop (scale 0.5 → 1.1 → 1.0) cuando empieza.

Tipografía:
- Font: Oxanium o Inter Black 800.
- Size: 56px (escala 1080×1920 → equivalente a ~36px en mobile).
- Stroke: 8px negro (`text-shadow` con muchas direcciones o SVG stroke).
- Padding interno: 20px.
- Line height 1.1.
- Position default: `bottom` con margin de 250px del fondo (safe zone).

Posicionamiento absoluto, jamás dentro de safe zones.

### 2. `<CodeBlock />`

```tsx
interface CodeBlockProps {
  code: string;
  language: string;             // 'tsx' | 'js' | 'sql' | 'bash' | etc.
  themeColor: string;
  highlightLines?: number[];
  animation?: 'typewriter' | 'fade-in' | 'line-by-line';
  maxFontSize?: number;          // auto-fit por default
}
```

Usar `prism-react-renderer` o `shiki` para syntax highlighting. Theme dark inspirado en `night-owl` o `vitesse-dark`.

Animaciones:
- `typewriter`: cada caracter aparece secuencialmente.
- `line-by-line`: líneas aparecen de a una con fade.
- `fade-in`: bloque entero entra con scale 0.9 → 1.

Auto-fit: si el código tiene muchas líneas, reducir font-size para que entre en el bounding box (max 800×1000px).

### 3. `<Counter />`

```tsx
interface CounterProps {
  current: number;
  total: number;
  themeColor: string;
  position?: 'top-right' | 'top-left' | 'middle';
}
```

Render: `2 / 5` con número grande animado + barra de progreso debajo. Cuando `current` cambia, animar (spring) la transición.

### 4. `<HookCard />`

Card grande para los primeros 0-3s:
```tsx
interface HookCardProps {
  text: string;
  themeColor: string;
  variant: 'punch' | 'glitch' | 'slide';
}
```

`punch`: scale 0 → 1.1 → 1.0 con spring agresivo. Texto blanco grande, fondo translúcido oscuro con border de 4px en `themeColor` y glow.
`glitch`: efecto RGB shift + chromatic aberration.
`slide`: desliza desde abajo con blur que se desenfoca.

Texto: máximo 80 caracteres, font Oxanium 900 (black), font-size 128px (auto-fit a multilínea).

### 5. `<CtaCard />`

Card final 2-3s con:
- Texto del CTA (ej. "Comentá CURSOR y te mando el setup").
- Handle de Manuel (ej. "@manunavarro" o el que esté configurado).
- Pequeño avatar si está disponible.
- Animación de entrada slide-up desde abajo.

Position: bottom con padding 350px (safe zone).

### 6. `<Transitions />`

```tsx
export const WipeTransition: React.FC<{ direction: 'left' | 'right' | 'up' | 'down'; durationFrames?: number }>;
export const GlitchTransition: React.FC<{ durationFrames?: number }>;
export const ZoomPunch: React.FC<{ scale?: number; durationFrames?: number; children: React.ReactNode }>;
export const FlashTransition: React.FC<{ color?: string; durationFrames?: number }>;
```

Cada uno usa `useCurrentFrame()` y `interpolate()` para animar.

### 7. Sound effects

Helper que dispara `<Audio src={...} startFrom={...} />` para los sound effects (whoosh, click, ding, glitch, pop). Los archivos van en `packages/remotion/public/sfx/{name}.mp3` — placeholders ahora; reales después.

```tsx
export const SoundEffect: React.FC<{
  type: 'whoosh' | 'click' | 'ding' | 'glitch' | 'pop';
  atFrame: number;
}>;
```

### 8. Index export

```ts
export { Captions } from './captions';
export { CodeBlock } from './code-block';
export { Counter } from './counter';
export { HookCard } from './hook-card';
export { CtaCard } from './cta-card';
export { WipeTransition, GlitchTransition, ZoomPunch, FlashTransition } from './transitions';
export { SoundEffect } from './sfx';
```

## Reglas de calidad

- **Performance**: nada de re-render innecesario. Memoizar cuando hay arrays grandes (captions con 100+ words).
- **Accessibility-irrelevant**: esto es video, no UI. Pero contraste matters: captions amarillas/verdes sobre stroke negro siempre legibles.
- **Determinismo**: dado el mismo input, el output frame-perfect idéntico (Lambda re-renderiza si falla).
- **Sin imports relativos largos**: usar `@/` alias.

## Output esperado

7 componentes shared listos para que las templates (T3-P03..P08) los compongan. Probados en Remotion Studio con casos sintéticos.

## Verificación

Crear una composition `playground` en Root.tsx que muestre todos los componentes en una grilla → abrir studio → verificar que cada uno se ve bien.
