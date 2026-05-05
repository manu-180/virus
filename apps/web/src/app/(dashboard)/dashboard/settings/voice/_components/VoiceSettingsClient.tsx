'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mic, CheckCircle2, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Profile } from '@/server/profile/types';

// Simple indeterminate progress bar (avoids coupling to @base-ui/react/progress value={null} quirks)
function IndeterminateBar() {
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-bg-surface-high">
      <div
        className="absolute inset-y-0 left-0 h-full w-1/3 rounded-full bg-accent"
        style={{
          animation: 'indeterminate-slide 1.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes indeterminate-slide {
          0%   { transform: translateX(-100%); }
          60%  { transform: translateX(300%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 1 | 2 | 3;
type RecordingStatus = 'idle' | 'recording' | 'stopped';
type CloneStatus = 'cloning' | 'testing' | 'success' | 'error';

interface CloneError {
  code: string;
  message: string;
}

interface Props {
  profile: Profile;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROMPTS = [
  {
    duration: '1 min',
    tone: 'Tecnico',
    text: 'Voy a explicarte como funciona la programacion reactiva. Cuando un estado cambia en React, el componente re-renderiza. Eso significa que cada vez que llamas a setState, React programa una actualizacion del DOM virtual y lo compara con el anterior usando el algoritmo de reconciliacion...',
  },
  {
    duration: '30s',
    tone: 'Hook con energia',
    text: 'Estas escribiendo useEffect mal. Y no te diste cuenta.',
  },
  {
    duration: '30s',
    tone: 'Tono relajado',
    text: 'Hoy te muestro como construi un SaaS en 60 segundos con vibe coding.',
  },
  {
    duration: '30s',
    tone: 'Pregunta directa',
    text: '¿Que AI tool usas vos? ¿Cursor o Claude Code?',
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function getCloneErrorMessage(error: CloneError): string {
  if (error.code === 'QUOTA_EXCEEDED') {
    return 'Quota de ElevenLabs agotada. Revisá tu plan.';
  }
  if (error.code === 'VOICE_CLONE_FAILED') {
    return 'Audio de baja calidad. Grabá en un lugar más silencioso.';
  }
  if (error.code === 'PROFILE_UPDATE_FAILED') {
    return 'Voz clonada en ElevenLabs pero no se pudo guardar. Intentá de nuevo.';
  }
  if (error.code === 'SERVER_MISCONFIGURATION') {
    return 'El servicio de clonación no está configurado. Contactá soporte.';
  }
  return `Error inesperado: ${error.message}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { num: 1, label: 'Instrucciones' },
    { num: 2, label: 'Grabacion' },
    { num: 3, label: 'Clonando' },
  ] as const;

  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, idx) => (
        <div key={step.num} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={[
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border transition-colors',
                currentStep === step.num
                  ? 'bg-accent text-accent-fg border-accent'
                  : currentStep > step.num
                    ? 'bg-accent/20 text-accent border-accent/40'
                    : 'bg-bg-surface-high text-text-tertiary border-border',
              ].join(' ')}
            >
              {currentStep > step.num ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                step.num
              )}
            </div>
            <span
              className={[
                'text-xs whitespace-nowrap',
                currentStep === step.num ? 'text-text-primary' : 'text-text-tertiary',
              ].join(' ')}
            >
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={[
                'h-px w-12 mx-1 mb-4 transition-colors',
                currentStep > step.num ? 'bg-accent/40' : 'bg-border',
              ].join(' ')}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Instructions
// ---------------------------------------------------------------------------

function Step1Instructions({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-text-primary font-semibold text-base mb-1">
          Preparate para grabar
        </h3>
        <p className="text-text-tertiary text-sm">
          Seguí estas recomendaciones para obtener el mejor resultado.
        </p>
      </div>

      {/* Tips */}
      <div className="bg-bg-surface-high rounded-lg border border-border p-4 flex flex-col gap-2">
        {[
          'Buscá un lugar silencioso (sin eco)',
          'Usá el mejor micrófono disponible',
          'Hablá con tu tono natural de contenido',
        ].map((tip, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center">
              <span className="text-accent text-xs font-bold">{i + 1}</span>
            </span>
            <p className="text-text-secondary text-sm">{tip}</p>
          </div>
        ))}
      </div>

      {/* Prompts */}
      <div>
        <p className="text-text-secondary text-sm font-medium mb-3">
          Leé estos textos en voz alta durante la grabación:
        </p>
        <div className="flex flex-col gap-3">
          {PROMPTS.map((prompt, i) => (
            <div
              key={i}
              className="bg-bg-surface-high rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-bg-surface flex items-center justify-center text-xs text-text-tertiary font-semibold border border-border flex-shrink-0">
                  {i + 1}
                </span>
                <Badge variant="outline" className="text-text-tertiary text-xs border-border">
                  {prompt.duration}
                </Badge>
                <Badge variant="outline" className="text-accent text-xs border-accent/30 bg-accent/5">
                  {prompt.tone}
                </Badge>
              </div>
              <p className="text-text-primary text-sm leading-relaxed italic">
                &ldquo;{prompt.text}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </div>

      <Button
        onClick={onNext}
        className="self-start bg-accent text-accent-fg hover:bg-accent-hover gap-2"
      >
        Empezar a grabar
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Recording
// ---------------------------------------------------------------------------

interface Step2Props {
  onUploadSuccess: (storagePath: string) => void;
}

function Step2Recording({ onUploadSuccess }: Step2Props) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup streams and intervals on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setStatus('stopped');
        stream.getTracks().forEach((t) => t.stop());
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus('recording');
      setTimer(0);

      timerIntervalRef.current = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        toast.error('Permiso de micrófono denegado. Habilitalo en tu navegador.');
      } else {
        toast.error('No se pudo acceder al micrófono.');
        console.error('[recording] getUserMedia error:', err);
      }
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function resetRecording() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setTimer(0);
    setStatus('idle');
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }

  async function handleUpload() {
    if (!audioBlob) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'voice-sample.webm');

      const res = await fetch('/api/voice/upload-sample', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(`Error al subir audio: ${data?.error?.message ?? 'Error desconocido'}`);
        return;
      }

      onUploadSuccess(data.storagePath as string);
    } catch (err) {
      toast.error('Error de red al subir la grabación.');
      console.error('[upload] error:', err);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-text-primary font-semibold text-base mb-1">
          {status === 'idle' && 'Listo para grabar'}
          {status === 'recording' && 'Grabando...'}
          {status === 'stopped' && 'Grabacion completa'}
        </h3>
        <p className="text-text-tertiary text-sm">
          {status === 'idle' && 'Presioná el botón para empezar. Leé los textos en voz alta.'}
          {status === 'recording' && 'Leé los textos del paso anterior con tu tono natural.'}
          {status === 'stopped' && 'Escuchá la grabación. Si suena bien, subila.'}
        </p>
      </div>

      {/* Idle state */}
      {status === 'idle' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-16 h-16 rounded-full bg-bg-surface-high border border-border flex items-center justify-center">
            <Mic className="size-7 text-text-secondary" />
          </div>
          <Button
            onClick={startRecording}
            className="bg-accent text-accent-fg hover:bg-accent-hover gap-2"
          >
            <Mic className="size-4" />
            Empezar a grabar
          </Button>
        </div>
      )}

      {/* Recording state */}
      {status === 'recording' && (
        <div className="flex flex-col items-center gap-5 py-8">
          {/* Pulsing red dot + timer */}
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-danger" />
            </span>
            <span className="text-text-primary font-mono text-2xl font-semibold tabular-nums">
              {formatTimer(timer)}
            </span>
          </div>
          <p className="text-text-tertiary text-sm">Grabando en curso...</p>
          <Button
            onClick={stopRecording}
            variant="outline"
            className="border-danger text-danger hover:bg-danger/10 hover:text-danger"
          >
            Parar grabacion
          </Button>
        </div>
      )}

      {/* Stopped state */}
      {status === 'stopped' && (
        <div className="flex flex-col gap-4">
          <div className="bg-bg-surface-high rounded-lg border border-border p-4">
            <p className="text-text-secondary text-xs mb-2">Reproducí tu grabacion:</p>
            {audioUrl && (
              <audio
                controls
                src={audioUrl}
                className="w-full h-9"
                style={{ colorScheme: 'dark' }}
              />
            )}
            <p className="text-text-tertiary text-xs mt-2">
              Duración: {formatTimer(timer)}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={resetRecording}
              disabled={isUploading}
              className="border-border text-text-secondary hover:text-text-primary gap-2"
            >
              <RefreshCw className="size-4" />
              Re-grabar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isUploading}
              className="bg-accent text-accent-fg hover:bg-accent-hover gap-2"
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              {isUploading ? 'Subiendo...' : 'Subir esta grabacion'}
            </Button>
          </div>

          {/* Upload progress */}
          {isUploading && (
            <div className="flex flex-col gap-1.5">
              <p className="text-text-tertiary text-xs">Subiendo audio...</p>
              <IndeterminateBar />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Cloning
// ---------------------------------------------------------------------------

interface Step3Props {
  storagePath: string;
  onSuccess: () => void;
  onReRecord: () => void;
}

function Step3Cloning({ storagePath, onSuccess, onReRecord }: Step3Props) {
  const [cloneStatus, setCloneStatus] = useState<CloneStatus>('cloning');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const hasStarted = useRef(false);

  const runClone = useCallback(async () => {
    setCloneStatus('cloning');
    setErrorMessage('');

    try {
      const res = await fetch('/api/voice/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath }),
      });

      const data = await res.json();

      if (!res.ok) {
        const err: CloneError = data?.error ?? {
          code: 'INTERNAL_ERROR',
          message: 'Error desconocido',
        };
        setErrorMessage(getCloneErrorMessage(err));
        setCloneStatus('error');
        return;
      }

      // Play test audio if available
      if (data.testAudio && data.testAudioMime) {
        setCloneStatus('testing');
        try {
          const audioData = `data:${data.testAudioMime};base64,${data.testAudio}`;
          const audio = new Audio(audioData);
          await audio.play();
        } catch {
          // Non-fatal if autoplay is blocked
        }
      }

      setCloneStatus('success');
    } catch (err) {
      console.error('[clone] error:', err);
      setErrorMessage('Error de red al clonar la voz. Intentalo de nuevo.');
      setCloneStatus('error');
    }
  }, [storagePath]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runClone();
  }, [runClone]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-text-primary font-semibold text-base mb-1">
          {cloneStatus === 'cloning' && 'Clonando tu voz...'}
          {cloneStatus === 'testing' && 'Probando tu voz clonada...'}
          {cloneStatus === 'success' && 'Voz clonada exitosamente'}
          {cloneStatus === 'error' && 'Error al clonar'}
        </h3>
        <p className="text-text-tertiary text-sm">
          {cloneStatus === 'cloning' && 'Esto puede tardar unos segundos.'}
          {cloneStatus === 'testing' && 'Reproduciendo muestra de tu voz clonada.'}
          {cloneStatus === 'success' && '¿Suena bien?'}
          {cloneStatus === 'error' && 'Revisá el error y volvé a intentarlo.'}
        </p>
      </div>

      {/* Cloning / Testing state */}
      {(cloneStatus === 'cloning' || cloneStatus === 'testing') && (
        <div className="flex flex-col gap-4 py-4">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-accent flex-shrink-0" />
            <p className="text-text-secondary text-sm">
              {cloneStatus === 'cloning'
                ? 'Contactando ElevenLabs...'
                : 'Reproduciendo test de voz...'}
            </p>
          </div>
          <IndeterminateBar />
        </div>
      )}

      {/* Success state */}
      {cloneStatus === 'success' && (
        <div className="flex flex-col gap-4">
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle2 className="size-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-text-primary font-medium text-sm">
                Tu voz fue clonada exitosamente
              </p>
              <p className="text-text-secondary text-xs mt-1">
                Se esta reproduciendo una muestra de como suena tu voz clonada.
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={onReRecord}
              className="border-border text-text-secondary hover:text-text-primary gap-2"
            >
              <RefreshCw className="size-4" />
              No, re-grabar
            </Button>
            <Button
              onClick={onSuccess}
              className="bg-accent text-accent-fg hover:bg-accent-hover"
            >
              Si, confirmar
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {cloneStatus === 'error' && (
        <div className="flex flex-col gap-4">
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="size-5 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-danger text-sm">{errorMessage}</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={onReRecord}
              className="border-border text-text-secondary hover:text-text-primary gap-2"
            >
              <Mic className="size-4" />
              Volver a grabar
            </Button>
            <Button
              variant="outline"
              onClick={runClone}
              className="border-accent text-accent hover:bg-accent/10 gap-2"
            >
              <RefreshCw className="size-4" />
              Reintentar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

export default function VoiceSettingsClient({ profile }: Props) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [storagePath, setStoragePath] = useState<string>('');

  const hasVoice = Boolean(profile.default_voice_clone_id);

  function openWizard() {
    setCurrentStep(1);
    setStoragePath('');
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
    setCurrentStep(1);
    setStoragePath('');
  }

  function handleUploadSuccess(path: string) {
    setStoragePath(path);
    setCurrentStep(3);
  }

  function handleCloneSuccess() {
    closeWizard();
    router.refresh();
    toast.success('Voz clonada y guardada correctamente.');
  }

  function handleReRecord() {
    setStoragePath('');
    setCurrentStep(2);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------------------- */}
      {/* Section A — Current Voice Status                                     */}
      {/* ------------------------------------------------------------------- */}
      <section className="bg-bg-surface rounded-lg border border-border p-6">
        {hasVoice ? (
          /* ---- Active voice ---- */
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="size-5 text-accent" />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-text-primary font-semibold text-sm">
                    Voz clonada activa
                  </p>
                  <Badge variant="outline" className="border-accent/40 text-accent bg-accent/5 text-xs">
                    Activa
                  </Badge>
                </div>
                <p className="text-text-tertiary text-xs font-mono">
                  Voice ID: {profile.default_voice_clone_id}
                </p>
                <p className="text-text-tertiary text-xs">
                  Voz lista para síntesis
                </p>
              </div>
            </div>

            <Separator />

            <Button
              variant="outline"
              size="sm"
              onClick={openWizard}
              disabled={wizardOpen}
              className="self-start border-border text-text-secondary hover:text-text-primary gap-2"
            >
              <RefreshCw className="size-3.5" />
              Re-clonar mi voz
            </Button>
          </div>
        ) : (
          /* ---- No voice ---- */
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-bg-surface-high flex items-center justify-center flex-shrink-0 border border-border">
                <Mic className="size-5 text-text-secondary" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-text-primary font-semibold text-sm">
                  Clona tu voz en 3 minutos
                </p>
                <p className="text-text-secondary text-sm leading-relaxed">
                  Grabá una muestra de audio y dejá que la IA clone tu voz.
                </p>
              </div>
            </div>

            <Button
              onClick={openWizard}
              disabled={wizardOpen}
              className="self-start bg-accent text-accent-fg hover:bg-accent-hover gap-2"
            >
              <Mic className="size-4" />
              Clonar mi voz
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Section B — Wizard                                                   */}
      {/* ------------------------------------------------------------------- */}
      {wizardOpen && (
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-text-primary font-semibold text-base">
              Configurar voz clonada
            </h2>
            <button
              onClick={closeWizard}
              aria-label="Cerrar wizard"
              className="text-text-tertiary hover:text-text-secondary transition-colors text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Step indicator */}
          <StepIndicator currentStep={currentStep} />

          <Separator className="mb-5" />

          {/* Step content */}
          {currentStep === 1 && (
            <Step1Instructions onNext={() => setCurrentStep(2)} />
          )}

          {currentStep === 2 && (
            <Step2Recording onUploadSuccess={handleUploadSuccess} />
          )}

          {currentStep === 3 && storagePath && (
            <Step3Cloning
              storagePath={storagePath}
              onSuccess={handleCloneSuccess}
              onReRecord={handleReRecord}
            />
          )}
        </section>
      )}
    </div>
  );
}
