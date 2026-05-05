'use client';

import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Mic, ExternalLink, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  email: string;
  avatarUrl?: string | undefined;
  compact?: boolean;
}

function getInitials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]/);
  const first = parts[0] ?? '';
  const second = parts[1] ?? '';
  if (parts.length >= 2 && first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function UserMenu({ email, avatarUrl, compact = false }: UserMenuProps) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/auth/sign-out', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const avatar = (
    <Avatar
      className={cn(
        'cursor-pointer border border-white/10 transition-colors hover:border-accent/50',
        compact ? 'h-7 w-7' : 'h-8 w-8',
      )}
    >
      {avatarUrl && <AvatarImage src={avatarUrl} alt={email} />}
      <AvatarFallback className="bg-accent/20 text-xs font-medium text-accent">
        {getInitials(email)}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated"
        aria-label="Menú de usuario"
      >
        {compact ? (
          <div className="flex w-full min-w-0 items-center gap-2">
            {avatar}
            <span className="truncate text-xs text-text-secondary">{email}</span>
          </div>
        ) : (
          avatar
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 border-border bg-bg-surface text-text-primary"
      >
        <DropdownMenuLabel className="truncate px-2 py-1.5 text-xs font-normal text-text-tertiary">
          {email}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 text-sm"
          onClick={() => router.push('/dashboard/settings/account')}
        >
          <User className="h-4 w-4 text-text-tertiary" />
          Mi cuenta
        </DropdownMenuItem>

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 text-sm"
          onClick={() => router.push('/dashboard/settings/voice')}
        >
          <Mic className="h-4 w-4 text-text-tertiary" />
          Brand voice
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 text-sm"
          onClick={() => window.open('https://docs.virus.app', '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="h-4 w-4 text-text-tertiary" />
          Documentación
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 text-sm text-danger focus:text-danger"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
