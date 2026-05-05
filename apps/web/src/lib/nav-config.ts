export const NAV_ITEMS = [
  { id: 'home', label: 'Inicio', href: '/dashboard', icon: 'Home' },
  { id: 'ideas', label: 'Ideas', href: '/dashboard/ideas', icon: 'Lightbulb' },
  { id: 'pipeline', label: 'Pipeline', href: '/dashboard/pipeline', icon: 'Clapperboard' },
  { id: 'assets', label: 'Biblioteca', href: '/dashboard/assets', icon: 'Library' },
  { id: 'calendar', label: 'Calendario', href: '/dashboard/calendar', icon: 'Calendar' },
  { id: 'performance', label: 'Performance', href: '/dashboard/performance', icon: 'BarChart3' },
  { id: 'settings', label: 'Settings', href: '/dashboard/settings', icon: 'Settings' },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
export type NavItemId = NavItem['id'];
