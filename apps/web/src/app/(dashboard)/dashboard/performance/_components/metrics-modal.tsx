'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoOption {
  id: string
  video_ideas: { hook: string } | null
}

interface MetricsModalProps {
  videos: VideoOption[]
}

// ---------------------------------------------------------------------------
// Zod schema (no .default() — handled via defaultValues in useForm)
// ---------------------------------------------------------------------------

const MetricsSchema = z.object({
  video_id: z.string().min(1, 'Seleccioná un video'),
  platform: z.enum(['reels', 'tiktok', 'shorts']),
  views: z.coerce.number().int().min(0, 'Mínimo 0'),
  likes: z.coerce.number().int().min(0),
  comments: z.coerce.number().int().min(0),
  saves: z.coerce.number().int().min(0),
  shares: z.coerce.number().int().min(0),
  avg_watch_time: z.coerce.number().min(0).nullable().optional(),
  hook_retention: z.coerce.number().min(0).max(100).nullable().optional(),
  measured_at: z.string().min(1, 'Ingresá la fecha'),
})

type MetricsFormValues = z.infer<typeof MetricsSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDateTime(dateStr: string): string {
  if (dateStr.includes('T')) return dateStr
  return `${dateStr}T12:00:00-03:00`
}

// ---------------------------------------------------------------------------
// Form inner component
// ---------------------------------------------------------------------------

function MetricsForm({
  videos,
  onSuccess,
}: {
  videos: VideoOption[]
  onSuccess: () => void
}) {
  const form = useForm<MetricsFormValues>({
    resolver: zodResolver(MetricsSchema),
    defaultValues: {
      video_id: '',
      platform: 'reels',
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
      avg_watch_time: null,
      hook_retention: null,
      measured_at: todayISO(),
    },
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onSubmit(values: MetricsFormValues) {
    setIsSubmitting(true)
    try {
      const body = {
        platform: values.platform,
        views: values.views,
        likes: values.likes,
        comments: values.comments,
        saves: values.saves,
        shares: values.shares,
        avg_watch_time:
          values.avg_watch_time !== undefined && values.avg_watch_time !== null
            ? Number(values.avg_watch_time)
            : null,
        hook_retention:
          values.hook_retention !== undefined && values.hook_retention !== null
            ? Number(values.hook_retention)
            : null,
        measured_at: toDateTime(values.measured_at),
      }

      const res = await fetch(`/api/videos/${values.video_id}/performance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        const message =
          (json as { error?: { message?: string } } | null)?.error?.message ??
          'Error al guardar las métricas.'
        toast.error(message)
        return
      }

      toast.success('Métricas cargadas correctamente')
      onSuccess()
    } catch {
      toast.error('Error de conexión. Intentá de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass =
    'bg-white/[0.06] border-white/[0.10] text-white placeholder:text-white/30 focus-visible:ring-[#C8FF57]/40 focus-visible:border-[#C8FF57]/40'

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Video selector */}
        <FormField
          control={form.control}
          name="video_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/70">Video</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Seleccioná un video" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="bg-[#1a1d24] border-white/[0.10] text-white max-h-60">
                  {videos.length === 0 && (
                    <SelectItem value="__none__" disabled>
                      No hay videos publicados
                    </SelectItem>
                  )}
                  {videos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {(v.video_ideas?.hook ?? 'Sin hook').slice(0, 50)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Platform */}
        <FormField
          control={form.control}
          name="platform"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/70">Plataforma</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="bg-[#1a1d24] border-white/[0.10] text-white">
                  <SelectItem value="reels">Instagram (Reels)</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="shorts">YouTube Shorts</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Numeric fields — 2 col grid */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="views"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/70">Vistas</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    className={inputClass}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="likes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/70">Likes</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    className={inputClass}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="comments"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/70">Comentarios</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    className={inputClass}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="saves"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/70">Saves</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    className={inputClass}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="shares"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/70">Shares</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    className={inputClass}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="avg_watch_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/70">
                  Avg. watch time
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    placeholder="segundos"
                    className={inputClass}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hook_retention"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/70">
                  Hook retention %
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    placeholder="0-100"
                    className={inputClass}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="measured_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/70">Medido el</FormLabel>
                <FormControl>
                  <Input type="date" className={inputClass} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[#C8FF57] text-black hover:bg-[#b8ef47] font-semibold"
        >
          {isSubmitting ? 'Guardando...' : 'Guardar métricas'}
        </Button>
      </form>
    </Form>
  )
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default function MetricsModal({ videos }: MetricsModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function handleSuccess() {
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white gap-2"
          >
            <Upload className="w-4 h-4" />
            Cargar métricas
          </Button>
        }
      />

      <DialogContent className="bg-[#16191f] border-white/[0.10] text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-semibold">
            Cargar métricas
          </DialogTitle>
        </DialogHeader>

        <MetricsForm videos={videos} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  )
}
