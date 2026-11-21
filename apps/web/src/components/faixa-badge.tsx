import type { FaixaIcp } from '@orcestra/shared';
import { cn } from '@/lib/utils';

const CLASSE: Record<FaixaIcp, string> = {
  A: 'bg-faixa-a/15 text-faixa-a',
  B: 'bg-faixa-b/15 text-faixa-b',
  C: 'bg-faixa-c/15 text-faixa-c',
  D: 'bg-faixa-d/15 text-faixa-d',
};

/** Badge da faixa de ICP (A/B/C/D) com o score; sem faixa = ainda não calculado. */
export function FaixaBadge({
  faixa,
  score,
  className,
}: {
  faixa: FaixaIcp | null | undefined;
  score?: number;
  className?: string;
}) {
  if (!faixa)
    return (
      <span
        className={cn('inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground', className)}
        title="Score ainda não calculado"
      >
        —
      </span>
    );
  return (
    <span
      data-testid="faixa-badge"
      title={`Faixa ${faixa}${score !== undefined ? ` — score ${score}` : ''}`}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        CLASSE[faixa],
        className,
      )}
    >
      {faixa}
      {score !== undefined && <span className="font-normal tabular-nums">{score}</span>}
    </span>
  );
}
