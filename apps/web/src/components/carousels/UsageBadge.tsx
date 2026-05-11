// Pildorita pequeña que muestra "· N" al lado de un tema/ángulo/tono ya usado.
// Diseñada para que sea sutil — no compite visualmente con el label.
// Si count = 0 o undefined → no renderiza nada.

interface Props {
  count: number | undefined;
  className?: string;
}

export function UsageBadge({ count, className }: Props) {
  if (!count || count <= 0) return null;

  return (
    <span
      aria-label={`Usado ${count} ${count === 1 ? 'vez' : 'veces'}`}
      className={[
        'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5',
        'rounded-full text-[10px] font-medium leading-none',
        'bg-muted text-muted-foreground/80',
        'tabular-nums',
        className ?? '',
      ].join(' ')}
    >
      {count}
    </span>
  );
}
