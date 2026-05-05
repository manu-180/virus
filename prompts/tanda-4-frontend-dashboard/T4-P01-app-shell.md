---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T1-P03, T2-P02]
file-ownership:
  - apps/web/src/app/(dashboard)/layout.tsx
  - apps/web/src/components/layout/
  - apps/web/src/components/layout/sidebar.tsx
  - apps/web/src/components/layout/topbar.tsx
  - apps/web/src/components/layout/user-menu.tsx
  - apps/web/src/components/layout/breadcrumbs.tsx
  - apps/web/src/components/layout/command-palette.tsx
  - apps/web/src/lib/nav-config.ts
duracion-estimada: 60 min
---

# T4-P01 — App shell (sidebar + topbar + command palette)

## Contexto

Layout premium del dashboard. Lo van a usar todas las pantallas (T4-P02..P07). Sin estética sofisticada, los demás prompts no van a producir un resultado coherente.

Lee:
- `prompts/00-DESIGN-TOKENS.md`
- `prompts/00-ARCHITECTURE.md`
- `C:\MisProyectos\APEX\APEX_next\ANALISIS.md` (estética premium dark de Manuel)

## Tarea

### 1. Layout `(dashboard)/layout.tsx`

Server component que:
- Verifica auth (redirect a /login si no).
- Carga el profile del user (vía supabase server client).
- Renderiza `<Sidebar />` + `<Topbar />` + `{children}` en grid.

Estructura grid:
```
+-----------+-------------------------+
|           |       Topbar            |
|  Sidebar  +-------------------------+
|  (240px)  |                         |
|           |     children            |
|           |                         |
+-----------+-------------------------+
```

### 2. `<Sidebar />`

Items:
- Logo "Virus" arriba (mock SVG simple, fuente Oxanium 900).
- Navegación principal:
  - 🏠 **Inicio** → `/dashboard`
  - 💡 **Ideas** → `/dashboard/ideas`
  - 🎬 **Pipeline** → `/dashboard/pipeline`
  - 📅 **Calendario** → `/dashboard/calendar`
  - 📊 **Performance** → `/dashboard/performance`
  - ⚙️ **Settings** → `/dashboard/settings`
- En el bottom: badge con plan ("Pro plan ⚡") + UserMenu compacto.

Estilo:
- Background `bgElevated`, border-right sutil.
- Items con icono (lucide-react) + texto.
- Activo: fondo accent al 12%, texto accent, border-left 3px accent.
- Hover: fondo accent al 6%.
- Animación de entrada al cargar (slide-in 300ms).
- Sticky, full-height.

Móvil: sidebar colapsa a un trigger hamburger en topbar (sheet).

### 3. `<Topbar />`

- Lado izq: breadcrumbs según ruta (helper para parsearlos del pathname).
- Centro: search bar grande (placeholder "Buscar idea, video, hook... (⌘K)") que abre Command Palette.
- Lado der: UserMenu (avatar + dropdown).

Sticky top, fondo `bgElevated` con backdrop-blur, border-bottom sutil.

### 4. `<CommandPalette />` (⌘K / Ctrl+K)

Usar shadcn `<Command>`. Acciones rápidas:
- "Nueva idea" → POST a `/api/ideas/generate` y redirect a /ideas
- "Ir a Pipeline" → /dashboard/pipeline
- "Ir a Calendario" → /dashboard/calendar
- "Cambiar tema" → toggle dark/darker
- Búsqueda real de videos por título/hook (full-text search en supabase).

Listener global `useEffect` que escucha `keydown` con `cmd+k` o `ctrl+k`.

### 5. `<UserMenu />`

Dropdown con:
- Avatar + email del user.
- "Mi cuenta" → /dashboard/settings/account
- "Brand voice" → /dashboard/settings/voice
- Separator
- "Documentación" → external link
- "Cerrar sesión" (POST a /auth/sign-out)

### 6. `nav-config.ts`

Single source of truth para items de nav (sidebar, topbar, command palette todos lo consumen).

```ts
export const NAV_ITEMS = [
  { id: 'home', label: 'Inicio', href: '/dashboard', icon: 'Home' },
  { id: 'ideas', label: 'Ideas', href: '/dashboard/ideas', icon: 'Lightbulb' },
  // ...
] as const;
```

### 7. Animaciones / detalles "premium"

- **Subtle gradient blob** en background del topbar (color accent muy diluido, blur 200px).
- **Logo glow** en hover.
- **Loading state** del topbar: skeleton hasta que el profile cargue.
- **Toast container** de sonner posicionado top-right.

## Reglas

- Todo server-component-first; client components solo donde hay interactividad (sidebar collapse, command palette).
- Performance: usar `next/dynamic` para Command Palette (carga on-demand).
- Accesible: keyboard nav en sidebar (tab + arrow keys).

## Output esperado

Shell completo. Las páginas hijas (T4-P02..P07) solo se preocupan por su contenido, no del layout.

## Verificación

```bash
pnpm dev
# Login → /dashboard muestra layout con sidebar + topbar
# ⌘K abre command palette
# Click en items navega correctamente
```
