import { Brain, Mic, FileText, Cloud, ExternalLink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const metadata = {
  title: 'Costos | Configuración',
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface ServiceRow {
  name: string;
  icon: LucideIcon;
  description: string;
  estimate: string;
  invoiceUrl: string;
}

const SERVICES: ServiceRow[] = [
  {
    name: 'Anthropic API',
    icon: Brain,
    description: 'Tokens consumidos × pricing por modelo (Sonnet / Haiku)',
    estimate: '~$5–15 USD',
    invoiceUrl: 'https://console.anthropic.com/billing',
  },
  {
    name: 'ElevenLabs',
    icon: Mic,
    description: 'Caracteres generados por síntesis de voz clonada',
    estimate: '~$22 USD',
    invoiceUrl: 'https://elevenlabs.io/app/subscription',
  },
  {
    name: 'AssemblyAI',
    icon: FileText,
    description: 'Minutos de audio transcriptos',
    estimate: '~$2–5 USD',
    invoiceUrl: 'https://www.assemblyai.com/dashboard/billing',
  },
  {
    name: 'AWS Lambda',
    icon: Cloud,
    description: 'Invocaciones y tiempo de ejecución de funciones',
    estimate: '~$1–3 USD',
    invoiceUrl: 'https://console.aws.amazon.com/billing',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-6">

      {/* Header card */}
      <div className="bg-bg-surface rounded-lg border border-border p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-text-primary text-base font-semibold">
            Costos estimados del mes
          </h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-border text-text-tertiary bg-bg-surface-high shrink-0">
            informativo
          </span>
        </div>
        <p className="text-text-tertiary text-sm">
          Costos aproximados en base al uso promedio mensual.
          Los valores reales dependen del volumen de contenido generado.
        </p>
      </div>

      {/* Service rows */}
      <div className="bg-bg-surface rounded-lg border border-border overflow-hidden">
        {SERVICES.map((service, index) => {
          const Icon = service.icon;
          return (
            <div key={service.name}>
              {index > 0 && (
                <div className="border-t border-border" />
              )}
              <div className="flex items-center gap-4 px-6 py-4">
                {/* Icon */}
                <div className="flex items-center justify-center size-9 rounded-md bg-bg-surface-high border border-border shrink-0">
                  <Icon className="size-4 text-text-secondary" aria-hidden="true" />
                </div>

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-semibold leading-tight">
                    {service.name}
                  </p>
                  <p className="text-text-tertiary text-xs mt-0.5 leading-snug">
                    {service.description}
                  </p>
                </div>

                {/* Estimate */}
                <span className="text-warning text-sm font-semibold tabular-nums shrink-0 hidden sm:block">
                  {service.estimate}
                </span>

                {/* Invoice link */}
                <a
                  href={service.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-text-secondary hover:text-text-primary hover:border-accent/60 transition-colors shrink-0"
                  aria-label={`Ver invoice de ${service.name}`}
                >
                  Ver invoice
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </div>

              {/* Mobile-only estimate row */}
              <div className="sm:hidden px-6 pb-4 -mt-2">
                <span className="text-warning text-sm font-semibold tabular-nums">
                  {service.estimate}
                </span>
              </div>
            </div>
          );
        })}

        {/* Total row */}
        <div className="border-t border-border bg-bg-surface-high px-6 py-4 flex items-center justify-between gap-4">
          <span className="text-text-secondary text-sm font-medium">Total estimado</span>
          <span className="text-text-primary text-base font-semibold tabular-nums">
            ~$30–45 USD/mes
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-text-tertiary text-xs leading-relaxed px-1">
        Los costos son estimados. Los valores reales dependen del uso.
        Manuel paga cada servicio directamente a cada proveedor.
      </p>

    </div>
  );
}
