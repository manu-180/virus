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

type VoiceState = 'idle' | 'uploading' | 'done' | 'skipped';

export function StepVoice({ profile, onNext, onBack }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const initialState: VoiceState = profile?.default_voice_clone_id
    ? 'done'
    : profile?.onboarding_voice_skipped
    ? 'skipped'
    : 'idle';
  const [state, setState] = useState<VoiceState>(initialState);
  const [isPending, startTransition] = useTransition();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState('uploading');
    // TODO (T4-P06): Upload to Supabase Storage voice_samples bucket,
    // call ElevenLabs /v1/voices/add API, save returned elevenlabs_voice_id
    // via saveVoiceStep({ voiceCloneId }).
    await new Promise((r) => setTimeout(r, 1200));
    const placeholderVoiceId = `onboarding_${Date.now()}`;

    startTransition(async () => {
      const result = await saveVoiceStep({ voiceCloneId: placeholderVoiceId, skip: false });
      if (!result.ok) {
        toast.error(result.error);
        setState('idle');
        return;
      }
      setState('done');
    });
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
              disabled={state === 'uploading' || isPending}
            >
              <Upload size={14} className="mr-2" />
              {state === 'uploading' ? 'Procesando...' : 'Elegir archivo'}
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
