'use client';

import { Sun, Sunset, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

function getGreeting(hour: number): { text: string; Icon: typeof Sun } {
  if (hour >= 5 && hour < 12) return { text: 'Buen día', Icon: Sun };
  if (hour >= 12 && hour < 18) return { text: 'Buenas tardes', Icon: Sunset };
  return { text: 'Buenas noches', Icon: Moon };
}

function formatNextPublish(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);

  const msPerDay = 1000 * 60 * 60 * 24;
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / msPerDay);

  const timeStr = target.toLocaleTimeString('es-AR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (diffDays === 0) return `hoy a las ${timeStr}`;
  if (diffDays === 1) return `mañana a las ${timeStr}`;

  const dateLabel = target.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
  });
  return `el ${dateLabel} a las ${timeStr}`;
}

interface HeroSectionProps {
  queueCount: number;
  nextPublish: string | null;
}

export default function HeroSection({ queueCount, nextPublish }: HeroSectionProps) {
  const now = new Date();
  const hour = now.getHours();
  const { text: greeting, Icon: GreetingIcon } = getGreeting(hour);

  const hasQueue = queueCount > 0;
  const formattedDate = nextPublish ? formatNextPublish(nextPublish) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2 text-white/40">
        <GreetingIcon size={18} />
        <span className="text-sm font-medium uppercase tracking-widest">{greeting}</span>
      </div>

      <h1 className="text-4xl font-bold text-white leading-tight">
        {greeting}, Manuel.
      </h1>

      <p className="text-lg text-white/60 leading-relaxed max-w-2xl">
        {hasQueue ? (
          <>
            Tenés{' '}
            <span className="text-[#C8FF57] font-semibold">
              {queueCount} {queueCount === 1 ? 'video' : 'videos'} en cola
            </span>
            {formattedDate ? (
              <>
                {' '}y el próximo se publica{' '}
                <span className="text-[#C8FF57] font-semibold">{formattedDate}</span>.
              </>
            ) : (
              '.'
            )}
          </>
        ) : (
          'Listos para arrancar el día. Generá ideas nuevas.'
        )}
      </p>
    </motion.div>
  );
}
