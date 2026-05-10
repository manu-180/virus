'use client';

import { useState, useTransition, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Mic, Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import type { OnboardingProfile } from '@/server/onboarding/queries';
import { saveVoiceStep } from '@/server/onboarding/actions';

interface Props {
  profile: OnboardingProfile | null;
  onNext: () => void;
  onBack: () => void;
}

type VoiceState = 'idle' | 'uploading' | 'cloning' | 'done' | 'skipped';

const VOICE_ID_REGEX = /^[a-zA-Z0-9]{20}$/;

export function StepVoice({ profile, onNext, onBack }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  // A real ElevenLabs voice id is 20 alphanumeric chars. Treat anything else
  // (including legacy `onboarding_<timestamp>` placeholders) as not-yet-done
  // so the user is prompted to actually upload a sample.
  const existingId = profile?.default_voice_clone_id;
  const hasRealVoice = !!existingId && VOICE_ID_REGEX.test(existingId);
  const initialState: VoiceState = hasRealVoice
    ? 'done'
    : profile?.onboarding_voice_skipped
    ? 'skipped'
    : 'idle';
  const [state, setState] = useState<VoiceState>(initialState);
  const [isPending, startTransition] = useTransition();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear input value so re-selecting the same file fires onChange again
    if (fileRef.current) fileRef.current.value = '';

    setState('uploading');

    try {
      // 1. Upload audio sample to Supabase Storage (voice_samples bucket)
      const uploadForm = new FormData();
      uploadForm.append('file', file);

      const uploadRes = await fetch('/api/voice/upload-sample', {
        method: 'POST',
        body: uploadForm,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        toast.error(`No se pudo subir el audio: ${uploadData?.error?.message ?? 'Error desconocido'}`);
        setState('idle');
        return;
      }

      const storagePath = uploadData.storagePath as string;

      // 2. Clone the voice in ElevenLabs and persist the returned voice_id
      setState('cloning');
      const cloneRes = await fetch('/api/voice/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath }),
      });
      const cloneData = await cloneRes.json();

      if (!cloneRes.ok) {
        const code = cloneData?.error?.code ?? 'UNKNOWN';
        const msg =
          code === 'QUOTA_EXCEEDED'
            ? 'Quota de ElevenLabs agotada. Revisá tu plan.'
            : code === 'VOICE_CLONE_FAILED'
            ? 'Audio de baja calidad. Grabá en un lugar más silencioso.'
            : code === 'SERVER_MISCONFIGURATION'
            ? 'El servicio de clonación no está configurado.'
            : `Error al clonar la voz: ${cloneData?.error?.message ?? 'desconocido'}`;
        toast.error(msg);
        setState('idle');
        return;
      }

      const voiceId = cloneData.voiceId as string;

      // 3. Mark onboarding voice step as completed (clears skipped flag).
      //    The /api/voice/clone route already wrote default_voice_clone_id;
      //    saveVoiceStep just rewrites it idempotently and toggles the flag.
      startTransition(async () => {
        const result = await saveVoiceStep({ voiceCloneId: voiceId, skip: false });
        if (!result.ok) {
          toast.error(result.error);
          setState('idle');
          return;
        }
        setState('done');
        toast.success('Voz clonada correctamente.');
      });
    } catch (err) {
      console.error('[onboarding/step-voice] error:', err);
      toast.error('Error de red al procesar el audio.');
      setState('idle');
    }
  };

  const handleSkip = () => {
    startTransition(async () => {
      const result = await saveVoiceStep({ skip: true });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setState('skipped');
      onNext();
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">Tu voz</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Clonamos tu voz para que cada video suene exactamente como vos.
        </p>
      </div>

      {state === 'done' ? (
        <div
          className="flex items-center gap-3 p-4 rounded-xl border"
          style={{ borderColor: 'rgba(62,207,142,0.4)', backgroundColor: 'rgba(62,207,142,0.05)' }}
        >
          <CheckCircle size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <p className="font-semibold text-sm">Voz lista</p>
            <p className="text-xs text-muted-foreground">
              Tus videos van a sonar con tu propia voz.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="border border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-4 text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(62,207,142,0.1)' }}
            >
              <Mic size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="font-semibold">Subí una muestra de tu voz</p>
              <p className="text-sm text-muted-foreground mt-1">
                ~1 minuto hablando con tu tono natural. MP3, WAV o M4A.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={state === 'uploading' || state === 'cloning' || isPending}
            >
              <Upload size={14} className="mr-2" />
              {state === 'uploading'
                ? 'Subiendo audio...'
                : state === 'cloning'
                ? 'Clonando tu voz...'
                : 'Elegir archivo'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg border border-border bg-card">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-yellow-500" />
            <span>
              Si saltás este paso, tus videos van a usar la voz &ldquo;Mateo&rdquo; de
              ElevenLabs. Podés clonar tu voz después en{' '}
              <strong>Settings → Voz</strong>.
            </span>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors text-center"
          >
            Saltear por ahora y usar voz default
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
          ← Atrás
        </Button>
        {state === 'done' && (
          <Button className="flex-1" onClick={onNext} disabled={isPending}>
            Siguiente →
          </Button>
        )}
      </div>
    </div>
  );
}
