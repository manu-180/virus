'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Home,
  Lightbulb,
  Clapperboard,
  Calendar,
  BarChart3,
  Settings,
  Zap,
  Library,
  LayoutGrid,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/nav-config';
import { UserMenu } from './user-menu';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Lightbulb,
  Clapperboard,
  Calendar,
  BarChart3,
  Settings,
  Library,
  LayoutGrid,
};

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  email: string;
  avatarUrl?: string | undefined;
}

function NavItems({ email, avatarUrl }: { email: string; avatarUrl?: string | undefined }) {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);

  async function handleSignOut() {
    await fetch('/auth/sign-out', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const items = navRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]');
    if (!items || items.length === 0) return;
    const arr = Array.from(items);
    const current = arr.indexOf(document.activeElement as HTMLAnchorElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      arr[(current + 1) % arr.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      arr[(current - 1 + arr.length) % arr.length]?.focus();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center border-b border-border-subtle px-5">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
          aria-label="Virus — ir al inicio"
        >
          <span
            className={cn(
              'font-black text-xl tracking-tight text-text-primary',
              'transition-all duration-240',
              'group-hover:[text-shadow:0_0_20px_var(--color-accent),0_0_60px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]',
            )}
          >
            VIRUS
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav
        ref={navRef}
        className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4"
        aria-label="Navegación principal"
        onKeyDown={handleKeyDown}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
                'relative border-l-[3px] transition-all duration-150',
                'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                isActive
                  ? 'border-accent bg-accent/12 text-accent'
                  : 'border-transparent text-text-secondary hover:bg-accent/6 hover:text-text-primary',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom: plan badge + compact user menu + sign out */}
      <div className="shrink-0 space-y-2 border-t border-border-subtle px-3 py-4">
        <div className="flex items-center gap-2 rounded-md bg-bg-surface-high px-3 py-2">
          <Zap className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          <span className="text-xs font-medium text-text-secondary">Pro plan</span>
        </div>
        <div className="px-1">
          <UserMenu email={email} avatarUrl={avatarUrl} compact />
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium',
            'text-text-secondary transition-colors',
            'hover:bg-danger/10 hover:text-danger',
            'outline-none focus-visible:ring-2 focus-visible:ring-danger',
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ mobileOpen, onMobileClose, email, avatarUrl }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'hidden md:flex h-full w-60 shrink-0 flex-col',
          'border-r border-border-subtle bg-bg-elevated',
        )}
        aria-label="Sidebar"
      >
        <NavItems email={email} avatarUrl={avatarUrl} />
      </motion.aside>

      {/* Mobile sidebar as Sheet */}
      <Sheet
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) onMobileClose();
        }}
      >
        <SheetContent
          side="left"
          className="w-60 p-0 border-border-subtle bg-bg-elevated"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <NavItems email={email} avatarUrl={avatarUrl} />
        </SheetContent>
      </Sheet>
    </>
  );
}
