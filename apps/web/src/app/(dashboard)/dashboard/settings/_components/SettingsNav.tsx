'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Mic, Sparkles, Calendar, CreditCard, type LucideIcon } from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { href: '/dashboard/settings/account', label: 'Mi cuenta', icon: User },
  { href: '/dashboard/settings/voice', label: 'Voz clonada', icon: Mic },
  { href: '/dashboard/settings/brand', label: 'Brand voice', icon: Sparkles },
  { href: '/dashboard/settings/schedule', label: 'Calendario', icon: Calendar },
  { href: '/dashboard/settings/billing', label: 'Costos', icon: CreditCard },
];

type SettingsNavProps = {
  mobile?: boolean;
};

export default function SettingsNav({ mobile = false }: SettingsNavProps) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <div className="flex gap-1 pb-1">
        {NAV.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={[
                'whitespace-nowrap px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0',
                isActive
                  ? 'bg-bg-surface-high text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface',
              ].join(' ')}
              style={{ fontFamily: 'Oxanium, sans-serif' }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={[
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-bg-surface-high text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface',
            ].join(' ')}
            style={{ fontFamily: 'Oxanium, sans-serif' }}
          >
            <Icon
              size={16}
              className={isActive ? 'text-accent' : 'text-text-tertiary'}
              aria-hidden="true"
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
