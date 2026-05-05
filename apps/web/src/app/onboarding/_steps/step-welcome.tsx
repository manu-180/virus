'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Zap, Video, Download } from 'lucide-react';

interface Props {
  onNext: () => void;
}

const FEATURES = [
  {
    icon: Zap,
    title: 'Ideas virales basadas en research real',
    description: 'Analizamos qué funciona en tu nicho y generamos hooks probados.',
  },
  {
    icon: Video,
    title: 'Videos verticales con tu voz',
    description: 'Script, voz clonada, captions y render automático.',
  },
  {
    icon: Download,
    title: 'Vos solo descargás y publicás',
    description: 'Un video listo en ~5 minutos. Sin edición manual.',
  },
];

export function StepWelcome({ onNext }: Props) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold text-foreground leading-tight">
          Bienvenido a{' '}
          <span style={{ color: 'var(--accent)' }}>Virus</span>,
          <br />
          Manuel.
        </h1>
        <p className="text-muted-foreground text-lg">
          Configuremos tu cuenta en 4 pasos rápidos.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {FEATURES.map(({ icon: Icon, title, description }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.12 }}
            className="flex items-start gap-4"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(62,207,142,0.12)' }}
            >
              <Icon size={20} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{title}</p>
              <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <Button size="lg" onClick={onNext} className="w-full font-semibold">
        Empezar →
      </Button>
    </div>
  );
}
