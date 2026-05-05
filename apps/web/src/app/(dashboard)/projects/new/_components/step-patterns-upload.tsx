'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TemplateDownloadButton } from './template-download-button';

const ACCEPTED_TYPES = [
  'text/markdown',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
const ACCEPTED_EXTENSIONS = ['.md', '.json', '.pdf', '.png', '.jpg', '.webp'];
const MAX_BYTES = 10 * 1024 * 1024;

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

interface Props {
  projectId: string;
  onNext: () => void;
  onBack: () => void;
  onFileUploaded: (fileId: string) => void;
}

export function StepPatternsUpload({ projectId, onNext, onBack, onFileUploaded }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const validateFile = (f: File): string | null => {
    if (ACCEPTED_TYPES.length > 0 && !ACCEPTED_TYPES.includes(f.type as typeof ACCEPTED_TYPES[number])) {
      return 'Formato no admitido. Usá .md, .json, .pdf o imagen.';
    }
    if (f.size > MAX_BYTES) return 'El archivo supera los 10MB.';
    return null;
  };

  const handleFileSelect = (f: File) => {
    const err = validateFile(f);
    setValidationError(err);
    setFile(err ? null : f);
    setUploadStatus('idle');
    setErrorMessage(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadStatus('uploading');
    setErrorMessage(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('kind', 'viral_patterns');
      formData.append('file', file);

      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      const json = await res.json() as { fileId?: string; error?: { code: string; message: string } };

      if (!res.ok || json.error) {
        setUploadStatus('error');
        setErrorMessage(json.error?.message ?? 'Error al subir el archivo.');
        return;
      }

      if (!json.fileId) {
        setUploadStatus('error');
        setErrorMessage('Respuesta inesperada del servidor.');
        return;
      }

      onFileUploaded(json.fileId);
      setUploadStatus('done');
      onNext();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setUploadStatus('error');
      setErrorMessage('Error de red. Intentá de nuevo.');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">Patrones virales</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Subí tu archivo con los patrones que quierés replicar.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Podés usar nuestra plantilla como punto de partida.
        </span>
        <TemplateDownloadButton kind="patterns" />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Zona de carga de archivo — hacé clic o arrastrá un archivo"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
          isDragging ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-border hover:border-muted-foreground/40'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Seleccionar archivo de patrones virales"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
        />
        <Upload className="size-8 text-muted-foreground" />
        {file ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Arrastrá un archivo o hacé click</span>
            <span className="text-xs text-muted-foreground">
              {ACCEPTED_EXTENSIONS.join(', ')} · máx 10MB
            </span>
          </div>
        )}
      </div>

      {validationError && (
        <p className="text-xs text-destructive">{validationError}</p>
      )}

      {uploadStatus === 'done' && (
        <div className="flex items-center gap-2 text-emerald-500 text-sm">
          <CheckCircle className="size-4 shrink-0" />
          Archivo subido correctamente.
        </div>
      )}

      {uploadStatus === 'error' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-destructive text-sm">
            <XCircle className="size-4 shrink-0" />
            {errorMessage}
          </div>
          <Button variant="outline" size="sm" className="self-start" onClick={handleUpload}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button ref={firstRef} type="button" variant="ghost" onClick={onBack}>
          ← Atrás
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!file || uploadStatus === 'uploading' || uploadStatus === 'done'}
          onClick={handleUpload}
        >
          {uploadStatus === 'uploading' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Subiendo...
            </>
          ) : (
            'Subir archivo'
          )}
        </Button>
      </div>
    </div>
  );
}
