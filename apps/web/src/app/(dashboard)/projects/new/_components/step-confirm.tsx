'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ParseStatusWatcher } from './parse-status-watcher';
import { WIZARD_STORAGE_KEY } from './wizard';
import type { WizardState } from './wizard';

interface Props {
  state: WizardState;
  onBack: () => void;
}

export function StepConfirm({ state, onBack }: Props) {
  const router = useRouter();
  const backRef = useRef<HTMLButtonElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const [allParsed, setAllParsed] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fileIds = useMemo(
    () => [state.patternsFileId, state.brandFileId].filter(Boolean) as string[],
    [state.patternsFileId, state.brandFileId]
  );

  const handleAllParsed = useCallback(() => setAllParsed(true), []);
  const handleError = useCallback(() => setHasError(true), []);

  useEffect(() => {
    if (allParsed) generateRef.current?.focus();
  }, [allParsed]);

  const handleGenerate = () => {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
    router.push(`/projects/${state.projectSlug}?autogenerate=1`);
  };

  const handleRetry = () => {
    toast.info('Contactá soporte si el error persiste');
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">Todo listo</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Revisá los datos y esperá que los archivos terminen de parsearse.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumen del proyecto</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">Nombre</dt>
              <dd className="font-medium text-right">{state.basics?.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">Slug</dt>
              <dd className="font-mono text-right">{state.basics?.slug}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">Nicho</dt>
              <dd className="text-right">{state.basics?.niche}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">Idioma</dt>
              <dd className="text-right">{state.basics?.language}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">Color</dt>
              <dd className="flex items-center gap-2">
                <span
                  className="size-4 rounded-full border border-border inline-block"
                  style={{ backgroundColor: state.basics?.themeColor }}
                />
                <span className="font-mono">{state.basics?.themeColor}</span>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {state.projectId && fileIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Estado de archivos</CardTitle>
          </CardHeader>
          <CardContent>
            <ParseStatusWatcher
              projectId={state.projectId}
              fileIds={fileIds}
              onAllParsed={handleAllParsed}
              onError={handleError}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 pt-2">
        {allParsed && (
          <Button
            ref={generateRef}
            onClick={handleGenerate}
            className="w-full animate-bounce"
            style={{ backgroundColor: 'var(--accent)', color: 'black', animationIterationCount: 3 }}
          >
            Generar primer video
          </Button>
        )}

        {hasError && (
          <Button variant="outline" onClick={handleRetry} className="w-full">
            Reintentar parseo
          </Button>
        )}

        {!allParsed && (
          <Button ref={backRef} type="button" variant="ghost" onClick={onBack}>
            ← Atrás
          </Button>
        )}
      </div>
    </div>
  );
}
