# Layout Components — Integration Notes

## T4-P08: TopbarProjectSwitcher integration

The `TopbarProjectSwitcher` component (from `@/components/project-switcher`) is ready to be wired into the layout. Two files need editing.

---

### 1. `app-shell.tsx` — Wrap with `ActiveProjectProvider`

`TopbarProjectSwitcher` calls `useActiveProject()`, which requires `ActiveProjectProvider` as an ancestor.

```diff
 'use client';

 import { useState } from 'react';
+import { ActiveProjectProvider } from '@/lib/active-project/hook';
 import { Sidebar } from './sidebar';
 import { Topbar } from './topbar';

 export function AppShell({ email, avatarUrl, children }: AppShellProps) {
   const [mobileOpen, setMobileOpen] = useState(false);

   return (
-    <div className="flex h-screen overflow-hidden bg-bg">
-      <Sidebar ... />
-      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
-        <Topbar ... />
-        <main ...>{children}</main>
-      </div>
-    </div>
+    <ActiveProjectProvider>
+      <div className="flex h-screen overflow-hidden bg-bg">
+        <Sidebar ... />
+        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
+          <Topbar ... />
+          <main ...>{children}</main>
+        </div>
+      </div>
+    </ActiveProjectProvider>
   );
 }
```

---

### 2. `topbar.tsx` — Add `TopbarProjectSwitcher` after breadcrumbs

Add the import at the top:

```diff
+import { TopbarProjectSwitcher } from '@/components/project-switcher';
```

Then insert the component between the breadcrumbs div and the search button (line ~56):

```diff
         {/* Left: breadcrumbs */}
         <div className="hidden min-w-0 flex-1 items-center md:flex">
           <Breadcrumbs />
         </div>

+        {/* Project switcher */}
+        <TopbarProjectSwitcher />
+
         {/* Center: search trigger */}
         <button
           onClick={openCommandPalette}
```

The switcher handles its own mobile/desktop layout internally (Sheet on <768px, Popover on ≥768px) and the `/` keyboard shortcut globally. No additional props needed.
