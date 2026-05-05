'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Inicio',
  ideas: 'Ideas',
  pipeline: 'Pipeline',
  calendar: 'Calendario',
  performance: 'Performance',
  settings: 'Settings',
  account: 'Cuenta',
  voice: 'Brand Voice',
};

interface Crumb {
  label: string;
  href: string;
  isLast: boolean;
}

function parseCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  let path = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    path += `/${seg}`;
    const label =
      ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, href: path, isLast: i === segments.length - 1 });
  }

  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = parseCrumbs(pathname);

  if (crumbs.length <= 1) {
    return (
      <span className="text-sm font-medium text-text-primary">
        {crumbs[0]?.label ?? 'Dashboard'}
      </span>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-text-tertiary"
              aria-hidden
            />
          )}
          {crumb.isLast ? (
            <span className="font-medium text-text-primary">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-text-secondary transition-colors hover:text-text-primary"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
