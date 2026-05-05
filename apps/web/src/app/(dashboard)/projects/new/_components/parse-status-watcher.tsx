'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';

type ParseStatus = 'pending' | 'ok' | 'error';

interface Props {
  projectId: string;
  fileIds: string[];
  onAllParsed: () => void;
  onError?: () => void;
}

export function ParseStatusWatcher({ projectId, fileIds, onAllParsed, onError }: Props) {
  const [statuses, setStatuses] = useState<Map<string, ParseStatus>>(
    () => new Map(fileIds.map((id) => [id, 'pending']))
  );

  useEffect(() => {
    if (fileIds.length === 0) return;

    const supabase = createClient();

    supabase
      .from('project_files')
      .select('id, parse_status')
      .in('id', fileIds)
      .then(({ data }) => {
        if (!data) return;
        setStatuses((prev) => {
          const next = new Map(prev);
          for (const row of data) {
            next.set(row.id, row.parse_status as ParseStatus);
          }
          return next;
        });
      });

    const channel = supabase
      .channel(`project:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'project_files',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const { id, parse_status } = payload.new as { id: string; parse_status: string };
          setStatuses((prev) => new Map(prev).set(id, parse_status as ParseStatus));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fileIds]);

  const calledRef = useRef(false);

  useEffect(() => {
    if (fileIds.length === 0 || calledRef.current) return;
    const allOk = fileIds.every((id) => statuses.get(id) === 'ok');
    if (allOk) { calledRef.current = true; onAllParsed(); return; }
    const anyError = fileIds.some((id) => statuses.get(id) === 'error');
    if (anyError) { calledRef.current = true; onError?.(); }
  }, [statuses, fileIds, onAllParsed, onError]);

  return (
    <div className="flex flex-col gap-2">
      {fileIds.map((id) => {
        const status = statuses.get(id) ?? 'pending';
        return (
          <div key={id} className="flex items-center gap-2 text-sm">
            {status === 'pending' && (
              <>
                <Clock className="size-4 text-yellow-500 shrink-0" />
                <span className="text-muted-foreground">Parseando...</span>
              </>
            )}
            {status === 'ok' && (
              <>
                <CheckCircle className="size-4 text-emerald-500 shrink-0" />
                <span className="text-emerald-500">Listo</span>
              </>
            )}
            {status === 'error' && (
              <>
                <XCircle className="size-4 text-destructive shrink-0" />
                <span className="text-destructive">Falló</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
