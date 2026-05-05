---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01, T2-P08]
file-ownership:
  - apps/web/src/app/(dashboard)/projects/page.tsx
  - apps/web/src/app/(dashboard)/projects/_components/projects-grid.tsx
  - apps/web/src/app/(dashboard)/projects/_components/project-card.tsx
  - apps/web/src/app/(dashboard)/projects/_components/empty-state.tsx
  - apps/web/src/components/project-switcher/
  - apps/web/src/components/project-switcher/index.tsx
  - apps/web/src/components/project-switcher/combobox.tsx
  - apps/web/src/lib/active-project/
  - apps/web/src/lib/active-project/cookie.ts
  - apps/web/src/lib/active-project/hook.tsx
duracion-estimada: 60 min
---

# T4-P08 — Lista de proyectos + Project Switcher global

## Contexto

Página `/projects` que lista todos los proyectos del user (cards) + componente de switcher en el topbar de la app shell que permite cambiar el proyecto activo.

Lee primero:
- `apps/web/src/server/projects/queries.ts` (T2-P08) — `fetchProjectsList()`.
- `apps/web/src/app/(dashboard)/_components/topbar.tsx` (T4-P01) — donde insertar el switcher.

## Tarea

### 1. Página `/projects`

Server component que llama `fetchProjectsList()` y renderiza:

- **Header**: "Tus proyectos" + botón "+ Nuevo proyecto" (link a `/projects/new`).
- **Grid responsive** 1 / 2 / 3 columnas (`<ProjectsGrid>`).
- Cada `<ProjectCard>` muestra:
  - Nombre + slug.
  - Niche tag (chip pequeño con `theme_color` de fondo translúcido).
  - Mini stats: "3 en cola · publicado hace 2d".
  - Si no tiene patterns/brand parseados aún: badge "⚠ Configurar archivos".
  - Click → `/projects/[slug]`.
- **Empty state** (cero proyectos): card grande con CTA "Empezá creando tu primer proyecto" + ilustración + 2 botones: "Usar plantilla APEX-dev" (llama `ensureDefaultProject` server action) y "Crear desde cero" (link a `/projects/new`).

### 2. Project Switcher (`components/project-switcher/`)

Combobox shadcn-style que vive en el topbar:

```tsx
<ProjectSwitcher
  current={activeProject}
  projects={projects}
  onChange={(slug) => setActiveProjectSlug(slug)}
/>
```

UX:
- Trigger: chip con dot del `theme_color` + nombre del proyecto activo + chevron.
- Open: lista searchable con todos los proyectos. Tecla `/` abre el switcher (atajo).
- Footer del popover: "+ Nuevo proyecto" (cierra y navega a `/projects/new`).
- Cuando cambia, persistir en cookie `active_project_slug` (1 año) + invalidar la query relacionada.

### 3. Active project state (`lib/active-project/`)

- **`cookie.ts`**: helpers server-side para leer/setear `active_project_slug` desde cookies. Función `getActiveProjectSlug(): Promise<string | null>` (server) y action `setActiveProjectSlug(slug: string)` (server action).
- **`hook.tsx`**: `<ActiveProjectProvider>` cliente que expone:
  ```ts
  const { activeProject, switchProject, isLoading } = useActiveProject();
  ```
  Internamente usa SWR/React Query contra `/api/projects/[slug]` y sincroniza con la cookie.

### 4. Integración con topbar (T4-P01)

NO toques `topbar.tsx` directamente — exportá un slot component (`<TopbarProjectSwitcher />`) que el agente de T4-P01 inserta. Si T4-P01 ya está cerrado, dejá nota en `_components/README.md` con la línea exacta a agregar.

## Reglas

- Loading: skeleton de cards (3 placeholders).
- Animaciones: stagger de 60ms entre cards al entrar.
- A11y: combobox con `aria-expanded`, navegación por teclado.
- Mobile: switcher se vuelve drawer en <768px.

## Qué NO hagas

- NO crees el wizard de creación (eso es T4-P09).
- NO crees la página de detail (eso es T4-P10).
- NO toques server actions ni queries (eso es de T2-P08).

## Output esperado

`/projects` lista funcional con empty state, grid de cards, y switcher global integrado al topbar. Cookie persiste el activo.

## Verificación

Visual: navegar a `/projects` con 0 proyectos → ver empty state. Click "Usar plantilla APEX-dev" → tras unos segundos aparece la card APEX-dev. Click en switcher → abre combobox con APEX-dev. Tecla `/` desde cualquier página → abre switcher.
