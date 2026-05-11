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
import type {
  CarouselTopicItem,
  ProjectTopicsResponse,
} from '@/server/topics/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  projectId: string;
  /** Texto actual del tema (controlled). */
  value: string;
  /** Callback cuando cambia el texto, sea por elegir item o por escribir. */
  onChange: (text: string) => void;
  /**
   * Callback cuando el usuario explícitamente eligió un topic existente.
   * Se llama con null si limpia la selección o tipea algo que no existe.
   * El padre lo usa para enviar selectedTopicId al POST /api/carousels.
   *
   * IMPORTANTE: el contrato es "el último topic elegido del dropdown".
   * Si después el usuario edita el textarea, selectedTopicId queda igual
   * y el server detecta el diff (texto != title del topic) → crea variante
   * con parent_topic_id = selectedTopicId.
   */
  onSelectTopic: (topic: CarouselTopicItem | null) => void;
  /**
   * Callback opcional que recibe el mapa de usage (angle/tone) cuando se
   * recargan los topics. El padre lo usa para mostrar badges en los
   * Selects de Ángulo/Tono.
   */
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
  const onUsageLoadedRef = useRef(onUsageLoaded);
  onUsageLoadedRef.current = onUsageLoaded;

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

  // Agrupar topics: seeds vs variantes (user_added / user_edited)
  const { seeds, variants } = useMemo(() => {
    const seeds: CarouselTopicItem[] = [];
    const variants: CarouselTopicItem[] = [];
    for (const t of topics) {
      if (t.source === 'seed') seeds.push(t);
      else variants.push(t);
    }
    return { seeds, variants };
  }, [topics]);

  // ¿El texto que está tipeando matchea exacto algún topic? Si no, ofrecemos
  // "Usar como tema nuevo".
  const normalized = filter.trim().toLowerCase();
  const hasExactMatch = normalized.length > 0
    && topics.some((t) => t.title.trim().toLowerCase() === normalized);
  const showCreateOption = normalized.length >= 3 && !hasExactMatch;

  const handleSelect = (topic: CarouselTopicItem) => {
    onChange(topic.title);
    onSelectTopic(topic);
    setOpen(false);
  };

  const handleCreate = () => {
    onChange(filter.trim());
    onSelectTopic(null);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Trigger: textarea siempre editable + chevron para abrir el banco */}
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Si escribe a mano y se aleja del topic seleccionado, no
            // limpiamos selectedTopicId — el server decide en el POST si
            // hubo diff. Eso preserva el linkage parent_topic_id para
            // variantes.
          }}
          placeholder={placeholder}
          rows={3}
          className="pr-10"
          aria-invalid={Boolean(errorMessage)}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            type="button"
            className="absolute top-2 right-2 inline-flex items-center justify-center size-7 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Abrir banco de temas"
          >
            <ChevronDownIcon className="size-4" />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-[min(28rem,calc(100vw-2rem))] p-0"
          >
            <Command shouldFilter={true}>
              <CommandInput
                placeholder="Filtrar temas…"
                value={filter}
                onValueChange={setFilter}
                autoFocus
              />
              <CommandList>
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
                        // forceMount via value distinto evita que cmdk lo filtre
                        value={`__create__${filter}`}
                        onSelect={handleCreate}
                        className="gap-2 text-foreground/90"
                      >
                        <PlusIcon className="size-4" />
                        <span className="truncate">
                          Usar como tema nuevo: <span className="font-medium">"{filter.trim()}"</span>
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
