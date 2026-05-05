'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ensureDefaultProject } from '@/server/projects/actions';

// ---------------------------------------------------------------------------
// Inline SVG illustration
// ---------------------------------------------------------------------------

function FolderIllustration() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Folder back */}
      <rect
        x="6"
        y="22"
        width="60"
        height="38"
        rx="6"
        fill="white"
        fillOpacity="0.06"
        stroke="white"
        strokeOpacity="0.12"
        strokeWidth="1.5"
      />
      {/* Folder tab */}
      <path
        d="M6 22h22l4-6h34a6 6 0 0 1 0 0H6z"
        fill="white"
        fillOpacity="0.08"
      />
      {/* Folder tab outline */}
      <path
        d="M6 22c0-3.314 2.686-6 6-6h14l4-6h22c3.314 0 6 2.686 6 6v6"
        stroke="white"
        strokeOpacity="0.14"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Plus icon inside */}
      <line
        x1="36"
        y1="34"
        x2="36"
        y2="50"
        stroke="white"
        strokeOpacity="0.30"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="42"
        x2="44"
        y2="42"
        stroke="white"
        strokeOpacity="0.30"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmptyState() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUseTemplate() {
    setLoading(true);
    setError(null);
    try {
      const result = await ensureDefaultProject();
      if (!result.ok) {
        setError(result.error.message);
      } else {
        router.refresh();
      }
    } catch {
      setError('Algo salió mal. Intentalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center py-20">
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-12 py-14 flex flex-col items-center text-center max-w-md w-full">
        <FolderIllustration />

        <h2 className="text-white text-xl font-bold mt-6 mb-2">
          Empezá creando tu primer proyecto
        </h2>
        <p className="text-white/50 text-sm leading-relaxed mb-8">
          Organizá tu contenido, patrones virales y marca en un solo lugar.
        </p>

        {error && (
          <p className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 w-full">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={handleUseTemplate}
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-lg bg-[#C8FF57] text-[#111318] font-semibold text-sm px-5 py-2.5 hover:bg-[#d4ff6e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#111318]"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Creando plantilla...
              </>
            ) : (
              'Usar plantilla APEX-dev'
            )}
          </button>

          <Link
            href="/projects/new"
            className="w-full inline-flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.10] text-white font-medium text-sm px-5 py-2.5 hover:bg-white/[0.10] transition-colors"
          >
            Crear desde cero
          </Link>
        </div>
      </div>
    </div>
  );
}
