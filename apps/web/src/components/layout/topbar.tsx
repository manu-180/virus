'use client';

import dynamic from 'next/dynamic';
import { Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Breadcrumbs } from './breadcrumbs';
import { UserMenu } from './user-menu';

const CommandPalette = dynamic(
  () => import('./command-palette').then((m) => m.CommandPalette),
  { ssr: false },
);

interface TopbarProps {
  email: string;
  avatarUrl?: string | undefined;
  onMobileMenuToggle: () => void;
}

function openCommandPalette() {
  window.dispatchEvent(new Event('virus:open-command'));
}

export function Topbar({ email, avatarUrl, onMobileMenuToggle }: TopbarProps) {
  return (
    <>
      <CommandPalette />

      <header
        className={cn(
          'sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 px-4 md:px-6',
          'border-b border-border-subtle bg-bg-elevated/80 backdrop-blur-md',
          'relative overflow-hidden',
        )}
      >
        {/* Gradient blob — decorative accent glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/3 top-1/2 h-32 w-96 -translate-y-1/2 rounded-full bg-accent/5 blur-[100px]"
        />

        {/* Mobile hamburger */}
        <button
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md md:hidden',
            'text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          )}
          onClick={onMobileMenuToggle}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Left: breadcrumbs */}
        <div className="hidden min-w-0 flex-1 items-center md:flex">
          <Breadcrumbs />
        </div>

        {/* Center: search trigger */}
        <button
          onClick={openCommandPalette}
          className={cn(
            'hidden md:flex items-center gap-2 rounded-lg px-3 py-2',
            'w-64 border border-border bg-bg-surface text-sm text-text-tertiary',
            'transition-colors duration-150 hover:border-border-focus hover:text-text-secondary',
            'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          )}
          aria-label="Buscar (⌘K)"
        >
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1 text-left text-xs">
            Buscar idea, video, hook...
          </span>
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[10px] text-text-tertiary">
            ⌘K
          </kbd>
        </button>

        {/* Right: UserMenu */}
        <div className="ml-auto flex items-center md:ml-0">
          <UserMenu email={email} avatarUrl={avatarUrl} />
        </div>
      </header>
    </>
  );
}
