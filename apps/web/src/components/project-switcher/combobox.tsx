'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon, Plus } from 'lucide-react';

import type { ProjectListItem } from '@/server/projects/types';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectComboboxProps {
  current: ProjectListItem | null;
  projects: ProjectListItem[];
  onChange: (slug: string) => void;
}

// ---------------------------------------------------------------------------
// Shared Command content (used by both Popover and Sheet)
// ---------------------------------------------------------------------------

interface CommandContentProps {
  projects: ProjectListItem[];
  current: ProjectListItem | null;
  onSelect: (slug: string) => void;
  onRequestClose: () => void;
}

function CommandContent({ projects, current, onSelect, onRequestClose }: CommandContentProps) {
  return (
    <Command>
      <CommandInput placeholder="Buscar proyecto..." />
      <CommandList>
        <CommandEmpty>No se encontraron proyectos.</CommandEmpty>
        <CommandGroup>
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              value={project.slug}
              data-checked={current?.slug === project.slug ? 'true' : undefined}
              onSelect={() => onSelect(project.slug)}
              className="cursor-pointer"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: project.themeColor }}
                aria-hidden="true"
              />
              <span className="truncate">{project.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <div className="p-1">
          <Link
            href="/projects/new"
            onClick={onRequestClose}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <Plus size={12} aria-hidden />
            Nuevo proyecto
          </Link>
        </div>
      </CommandList>
    </Command>
  );
}

// ---------------------------------------------------------------------------
// Trigger button
// ---------------------------------------------------------------------------

interface TriggerButtonProps {
  current: ProjectListItem | null;
  open: boolean;
}

function TriggerButton(
  { current, open }: TriggerButtonProps,
  ref: React.Ref<HTMLButtonElement>,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      className="flex max-w-[200px] items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
    >
      {current ? (
        <>
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: current.themeColor }}
            aria-hidden="true"
          />
          <span className="truncate">{current.name}</span>
        </>
      ) : (
        <span className="text-white/40">Sin proyecto</span>
      )}
      <ChevronDownIcon
        className="ml-1 size-3.5 shrink-0 text-white/40 transition-transform duration-200"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        aria-hidden="true"
      />
    </button>
  );
}

const TriggerButtonForwardRef = React.forwardRef(TriggerButton);
TriggerButtonForwardRef.displayName = 'TriggerButton';

// ---------------------------------------------------------------------------
// Main combobox component
// ---------------------------------------------------------------------------

export function ProjectCombobox({
  current,
  projects,
  onChange,
}: ProjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // ---------------------------------------------------------------------------
  // Mobile detection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);

    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }

    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard shortcut: press "/" to open (when not in an input/textarea/contenteditable)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== '/') return;

      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();

      if (
        tag === 'input' ||
        tag === 'textarea' ||
        target.isContentEditable
      ) {
        return;
      }

      e.preventDefault();
      setOpen(true);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function handleSelect(slug: string) {
    onChange(slug);
    setOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
  }

  // ---------------------------------------------------------------------------
  // Render: Mobile → Sheet, Desktop → Popover
  // isMobile === null means not yet determined (SSR/pre-hydration) → use desktop layout
  // ---------------------------------------------------------------------------
  return isMobile === true ? (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <TriggerButtonForwardRef
            current={current}
            open={open}
          />
        }
      />
      <SheetContent side="bottom" showCloseButton className="pb-safe">
        <SheetHeader>
          <SheetTitle>Cambiar proyecto</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <CommandContent
            projects={projects}
            current={current}
            onSelect={handleSelect}
            onRequestClose={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  ) : (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <TriggerButtonForwardRef
            current={current}
            open={open}
          />
        }
      />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-64 p-0"
      >
        <CommandContent
          projects={projects}
          current={current}
          onSelect={handleSelect}
          onRequestClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
