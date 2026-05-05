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
import { Settings, LogOut } from 'lucide-react';

interface UserMenuProps {
  email: string;
  avatarUrl?: string;
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

export function UserMenu({ email, avatarUrl }: UserMenuProps) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/auth/sign-out', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111318]"
        aria-label="User menu"
      >
        <Avatar className="h-8 w-8 cursor-pointer border border-white/10 hover:border-white/30 transition-colors">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={email} />}
          <AvatarFallback className="bg-violet-600/30 text-violet-200 text-xs font-medium">
            {getInitials(email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 bg-[#1a1d24] border-white/10 text-white"
      >
        <DropdownMenuLabel className="text-white/50 font-normal text-xs truncate px-2 py-1.5">
          {email}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer flex items-center gap-2"
          onClick={() => router.push('/settings')}
        >
          <Settings className="h-4 w-4 text-white/50" />
          <span>Configuración</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer flex items-center gap-2 text-red-400"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          <span>Cerrar sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
