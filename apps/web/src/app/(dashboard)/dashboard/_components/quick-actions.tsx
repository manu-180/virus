'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Lightbulb,
  CalendarRange,
  Mic2,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CardData {
  icon: LucideIcon
  label: string
  description: string
  color: string
}

interface QuickActionsProps {
  hasProject: boolean
}

export default function QuickActions({ hasProject }: QuickActionsProps) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleTestVideo() {
    if (!hasProject) {
      setError('Creá primero un proyecto en Ajustes')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ideas/test-seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoApprove: true }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; videoId?: string }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      router.push('/dashboard/pipeline')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar')
      setGenerating(false)
    }
  }

  const cards: Array<
    | { kind: 'action'; data: CardData; onClick: () => void; busy: boolean }
    | { kind: 'link'; data: CardData; href: string }
  > = [
    {
      kind: 'action',
      onClick: handleTestVideo,
      busy: generating,
      data: {
        icon: Sparkles,
        label: 'Generar video de prueba',
        description: 'Hook random + script + audio + render',
        color: '#C8FF57',
      },
    },
    {
      kind: 'link',
      href: '/dashboard/ideas',
      data: {
        icon: Lightbulb,
        label: 'Banco de ideas',
        description: 'Aprobá hooks y disparalos a render',
        color: '#818CF8',
      },
    },
    {
      kind: 'link',
      href: '/dashboard/calendar',
      data: {
        icon: CalendarRange,
        label: 'Programar batch',
        description: 'Generá 7 días en lote',
        color: '#F59E0B',
      },
    },
    {
      kind: 'link',
      href: '/dashboard/settings/voice',
      data: {
        icon: Mic2,
        label: 'Mi voz clonada',
        description: 'Re-clonar audio en ElevenLabs',
        color: '#EC4899',
      },
    },
  ]

  return (
    <section data-tour="actions">
      <h2 className="text-lg font-semibold text-white mb-4">Acciones rápidas</h2>
      {error && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {cards.map((card, i) => (
          <Card key={card.data.label} data={card.data} index={i}>
            {card.kind === 'action' ? (
              <button
                type="button"
                onClick={card.onClick}
                disabled={card.busy}
                className="absolute inset-0 rounded-xl"
                aria-label={card.data.label}
              />
            ) : (
              <Link href={card.href} className="absolute inset-0 rounded-xl" aria-label={card.data.label} />
            )}
            {card.kind === 'action' && card.busy && (
              <div className="pointer-events-none absolute right-4 top-4">
                <Loader2 className="w-4 h-4 animate-spin text-white/60" />
              </div>
            )}
          </Card>
        ))}
      </div>
    </section>
  )
}

function Card({
  data,
  index,
  children,
}: {
  data: CardData
  index: number
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'relative flex flex-col gap-3 p-5 rounded-xl bg-white/[0.04] border border-white/[0.08]',
        'hover:bg-white/[0.07] hover:border-white/[0.15] transition-all duration-200 cursor-pointer',
      )}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${data.color}18` }}
      >
        <data.icon className="w-5 h-5" style={{ color: data.color }} />
      </div>
      <div>
        <p className="font-semibold text-white text-sm">{data.label}</p>
        <p className="text-xs text-white/50 mt-0.5">{data.description}</p>
      </div>
      <div className="mt-auto">
        <span className="text-xs font-medium" style={{ color: data.color }}>
          Ir →
        </span>
      </div>
      {children}
    </motion.div>
  )
}
