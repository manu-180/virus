'use client';

import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  kind: 'patterns' | 'brand';
}

export function TemplateDownloadButton({ kind }: Props) {
  const href =
    kind === 'patterns' ? '/templates/sample-patterns.md' : '/templates/sample-brand.md';

  return (
    <a
      href={href}
      download
      target="_blank"
      rel="noreferrer"
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'gap-1.5 text-muted-foreground hover:text-foreground'
      )}
    >
      <Download className="size-3.5" />
      Descargar plantilla
    </a>
  );
}
