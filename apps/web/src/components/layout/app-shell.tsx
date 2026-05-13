'use client';

import { useState } from 'react';
import { ActiveProjectProvider } from '@/lib/active-project/hook';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

interface AppShellProps {
  email: string;
  avatarUrl?: string | undefined;
  children: React.ReactNode;
}

export function AppShell({ email, avatarUrl, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ActiveProjectProvider>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar
          email={email}
          avatarUrl={avatarUrl}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            email={email}
            avatarUrl={avatarUrl}
            onMobileMenuToggle={() => setMobileOpen(true)}
          />
          <main className="flex-1 overflow-auto p-6" id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </ActiveProjectProvider>
  );
}
