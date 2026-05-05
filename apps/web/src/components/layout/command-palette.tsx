'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Lightbulb,
  Clapperboard,
  Calendar,
  Home,
  BarChart3,
  Settings,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('virus:open-command', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('virus:open-command', onOpenEvent);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function handleNewIdea() {
    setOpen(false);
    const toastId = toast.loading('Generando idea...');
    try {
      await fetch('/api/ideas/generate', { method: 'POST' });
      toast.success('¡Idea generada!', { id: toastId });
      router.push('/dashboard/ideas');
    } catch {
      toast.error('Error al generar idea', { id: toastId });
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Buscar ideas, videos, hooks y acciones rápidas"
    >
      <CommandInput
        placeholder="Buscar idea, video, hook..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>Sin resultados para &ldquo;{search}&rdquo;.</CommandEmpty>

        <CommandGroup heading="Acciones rápidas">
          <CommandItem onSelect={handleNewIdea}>
            <Lightbulb className="h-4 w-4 text-accent" />
            <span>Nueva idea</span>
            <CommandShortcut>IA</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/pipeline')}>
            <Clapperboard className="h-4 w-4" />
            <span>Ir a Pipeline</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/calendar')}>
            <Calendar className="h-4 w-4" />
            <span>Ir a Calendario</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegación">
          <CommandItem onSelect={() => go('/dashboard')}>
            <Home className="h-4 w-4" />
            <span>Inicio</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/ideas')}>
            <Lightbulb className="h-4 w-4" />
            <span>Ideas</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/performance')}>
            <BarChart3 className="h-4 w-4" />
            <span>Performance</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/settings')}>
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
