---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: design-system-architect
tanda: 1
depende-de: []
file-ownership:
  - packages/shared/src/tokens/
  - packages/shared/src/tokens/colors.ts
  - packages/shared/src/tokens/typography.ts
  - packages/shared/src/tokens/spacing.ts
  - packages/shared/src/tokens/motion.ts
  - packages/shared/src/tokens/video.ts
  - packages/shared/src/tokens/index.ts
  - apps/web/tailwind.config.ts
  - apps/web/src/app/globals.css
  - apps/web/src/styles/fonts.ts
duracion-estimada: 45 min
---

# T1-P03 — Design system + Tailwind config

## Contexto

Estamos construyendo "Virus", un dashboard premium para gestión de generación de videos virales. La estética debe ser **dark, premium, dev-aesthetic** — heredada de la marca APEX de Manuel.

Lee:
- `prompts/00-DESIGN-TOKENS.md` (esto es la fuente de verdad — convertilo en código).
- `C:\MisProyectos\APEX\APEX_next\ANALISIS.md` (para entender el lenguaje visual de Manuel; SOLO para referencia visual, no copiar features).

NO leas otros prompts.

## Tarea

### 1. Tokens en TS (`packages/shared/src/tokens/`)

Convertí los tokens de `00-DESIGN-TOKENS.md` a archivos TS exportados. Un archivo por categoría (colors, typography, spacing, motion, video). Un `index.ts` que reexporta todo.

Los tokens son consumidos por:
- `apps/web` — vía Tailwind config (variantes CSS).
- `packages/remotion` — directo en componentes (no usa Tailwind).

Para que ambos consuman lo mismo, exportalos como **objetos JS planos** (no CSS-in-JS). Así Tailwind los puede leer en `tailwind.config.ts` y Remotion los importa directo.

### 2. Tailwind v4 config (`apps/web/tailwind.config.ts`)

- Importa los tokens de `@virus/shared/tokens` y los mapea a `theme.extend.{colors, fontFamily, fontSize, spacing, borderRadius, boxShadow}`.
- Usa **Tailwind v4** (`@tailwindcss/postcss`), no v3.
- Configurá modo `dark` por **class** (`dark:` prefix), no por media query. El default es dark.
- Plugins: `tailwindcss-animate` para shadcn/ui, `@tailwindcss/typography` para descripciones markdown.

### 3. Globals CSS (`apps/web/src/app/globals.css`)

```css
@import 'tailwindcss';

@layer base {
  :root {
    /* CSS variables para shadcn/ui que mapean a nuestros tokens */
    --background: 240 10% 4%;          /* matches colors.bg */
    --foreground: 220 10% 96%;
    --card: 220 10% 7%;
    --primary: 154 60% 53%;            /* matches colors.accent */
    --primary-foreground: 240 10% 4%;
    --border: 220 10% 14%;
    /* ... resto de variables shadcn */
  }

  body {
    @apply bg-bg text-textPrimary font-sans antialiased;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }
}
```

Convertí TODOS los tokens de color a variables HSL para que shadcn/ui pueda consumirlos.

### 4. Fonts (`apps/web/src/styles/fonts.ts`)

Usá `next/font/local` con Oxanium variable (font subset) o `next/font/google` con Oxanium si está en Google Fonts.

```ts
import { Oxanium, JetBrains_Mono } from 'next/font/google';

export const oxanium = Oxanium({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});
```

Y consumirlos en `apps/web/src/app/layout.tsx` agregando `${oxanium.variable} ${jetbrainsMono.variable}` a `<html>`.

### 5. shadcn/ui — instalación

Inicializá shadcn/ui con `npx shadcn@latest init` apuntando a:
- Style: New York
- Base color: Custom (vamos a usar nuestros tokens)
- CSS variables: yes
- Path alias: `@/components/ui`

Instalá estos componentes base (los van a usar T4 prompts):
- `button`, `card`, `input`, `label`, `select`, `textarea`, `dialog`, `dropdown-menu`, `tooltip`, `tabs`, `badge`, `skeleton`, `toast` (sonner), `avatar`, `progress`, `separator`, `scroll-area`, `command`, `popover`, `calendar`, `form`, `sheet`, `switch`, `slider`.

Después de instalarlos, ajustá los archivos generados de shadcn para que usen nuestros tokens (colors, radius, fonts) — no los defaults de shadcn.

## Output esperado

```
packages/shared/src/tokens/
├── colors.ts
├── typography.ts
├── spacing.ts
├── motion.ts
├── video.ts
└── index.ts

apps/web/
├── tailwind.config.ts
├── postcss.config.mjs
├── src/app/globals.css
├── src/styles/fonts.ts
├── src/lib/utils.ts          ← cn helper
└── src/components/ui/        ← shadcn components
    ├── button.tsx
    ├── card.tsx
    └── ...
```

## Verificación

```bash
pnpm dev
# en localhost:3000, una página placeholder con un Button de shadcn
# debe mostrar fuente Oxanium y color accent #3ECF8E
```

Hacé que `apps/web/src/app/page.tsx` muestre algo simple usando los tokens para verificar:

```tsx
import { Button } from '@/components/ui/button';

export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-7xl font-black">Virus</h1>
        <p className="text-textSecondary text-xl">Dev content, weaponized.</p>
        <Button size="lg">Get started</Button>
      </div>
    </main>
  );
}
```

## Notas

- Si Oxanium no está disponible vía `next/font/google` (chequear Google Fonts directory), descargá la variable font y usala con `next/font/local` apuntando al archivo TTF que está en `C:\MisProyectos\APEX\APEX_next\public\fonts\Oxanium-VariableFont_wght.ttf` (copiá el archivo a `apps/web/public/fonts/`).
- NO escribas componentes complejos (navbar, sidebar, etc.) — eso es trabajo de T4.
- NO escribas templates de video — eso es T3.
