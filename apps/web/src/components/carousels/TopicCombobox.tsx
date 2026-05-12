'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, PlusIcon, Loader2 } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { UsageBadge } from './UsageBadge';
import { cn } from '@/lib/utils';
import type {
  CarouselTopicItem,
  ProjectTopicsResponse,
} from '@/server/topics/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  projectId: string;
  value: string;
  onChange: (text: string) => void;
  onSelectTopic: (topic: CarouselTopicItem | null) => void;
  onUsageLoaded?: (usage: ProjectTopicsResponse['usage']) => void;
  placeholder?: string;
  errorMessage?: string | undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopicCombobox({
  projectId,
  value,
  onChange,
  onSelectTopic,
  onUsageLoaded,
  placeholder = 'Escribí o elegí un tema…',
  errorMessage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState<CarouselTopicItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onUsageLoadedRef = useRef(onUsageLoaded);
  onUsageLoadedRef.current = onUsageLoaded;

  // Foco en el textarea al abrir
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Cargar topics cada vez que cambia el proyecto
  useEffect(() => {
    if (!projectId) return;

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/projects/${projectId}/topics`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json() as Promise<ProjectTopicsResponse>;
      })
      .then((data) => {
        setTopics(data.topics);
        onUsageLoadedRef.current?.(data.usage);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error('[TopicCombobox] fetch error', err);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [projectId]);

  const { seeds, variants } = useMemo(() => {
    const seeds: CarouselTopicItem[] = [];
    const variants: CarouselTopicItem[] = [];
    for (const t of topics) {
      if (t.source === 'seed') seeds.push(t);
      else variants.push(t);
    }
    return { seeds, variants };
  }, [topics]);

  const normalized = filter.trim().toLowerCase();
  const hasExactMatch =
    normalized.length > 0 &&
    topics.some((t) => t.title.trim().toLowerCase() === normalized);
  const showCreateOption = normalized.length >= 3 && !hasExactMatch;

  const handleSelect = (topic: CarouselTopicItem) => {
    onChange(topic.title);
    onSelectTopic(topic);
    setFilter('');
    setOpen(false);
  };

  const handleCreate = () => {
    onChange(filter.trim());
    onSelectTopic(null);
    setFilter('');
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        {/* ── Trigger: área entera clickeable ── */}
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label="Seleccionar tema del carrusel"
            className={cn(
              'group w-full min-h-[80px] rounded-lg border bg-transparent px-3 py-2.5',
              'text-left text-sm transition-all duration-200 outline-none relative',
              'hover:border-ring/60 hover:bg-accent/20',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              open
                ? 'border-ring ring-2 ring-ring ring-offset-2 ring-offset-background'
                : 'border-input',
              errorMessage && 'border-destructive focus-visible:ring-destructive',
            )}
          >
            {value ? (
              <span className="block text-foreground whitespace-pre-wrap break-words pr-7 leading-relaxed">
                {value}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}

            <span className="absolute top-2.5 right-2.5 flex items-center justify-center size-5 rounded text-muted-foreground/60 transition-all duration-200 group-hover:text-muted-foreground">
              <ChevronDownIcon
                className={cn(
                  'size-4 transition-transform duration-200',
                  open && 'rotate-180 text-primary',
                )}
              />
            </span>
          </button>
        </PopoverTrigger>

        {/* ── Popover: textarea + lista ── */}
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[var(--radix-popover-trigger-width)] p-0 shadow-2xl border-border/80"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Editar / escribir tema propio */}
          <div className="p-3 border-b border-border/60">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={3}
              className="resize-none border-0 shadow-none focus-visible:ring-0 p-0 text-sm bg-transparent"
            />
          </div>

          {/* Banco de temas */}
          <Command shouldFilter>
            <CommandInput
              placeholder="Filtrar temas del banco…"
              value={filter}
              onValueChange={setFilter}
              className="text-sm"
            />
            <CommandList className="max-h-52">
              {loading && (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Cargando temas…
                </div>
              )}

              {!loading && topics.length === 0 && (
                <CommandEmpty>
                  No hay temas cargados para este proyecto todavía.
                </CommandEmpty>
              )}

              {!loading && seeds.length > 0 && (
                <CommandGroup heading="Sugeridos para este proyecto">
                  {seeds.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={t.title}
                      onSelect={() => handleSelect(t)}
                      className="gap-2"
                    >
                      <span className="flex-1 truncate">{t.title}</span>
                      <UsageBadge count={t.usageCount} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {!loading && variants.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Tus variantes">
                    {variants.map((t) => (
                      <CommandItem
                        key={t.id}
                        value={t.title}
                        onSelect={() => handleSelect(t)}
                        className="gap-2"
                      >
                        <span className="flex-1 truncate">{t.title}</span>
                        <UsageBadge count={t.usageCount} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {!loading && showCreateOption && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value={`__create__${filter}`}
                      onSelect={handleCreate}
                      className="gap-2 text-foreground/90"
                    >
                      <PlusIcon className="size-4" />
                      <span className="truncate">
                        Usar como tema nuevo:{' '}
                        <span className="font-medium">"{filter.trim()}"</span>
                      </span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
