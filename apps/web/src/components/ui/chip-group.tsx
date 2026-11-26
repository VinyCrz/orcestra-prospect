'use client';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface OpcaoChip {
  valor: string;
  rotulo: string;
  detalhe?: string;
}

/**
 * Opções curtas em "chips" clicáveis. Por baixo são checkboxes (multi) ou rádios (único),
 * então continuam acessíveis por teclado, leitor de tela e testes por rótulo.
 */
export function ChipGroup({
  legenda,
  opcoes,
  valor,
  onChange,
  unico = false,
  ocultarLegenda = false,
}: {
  legenda: string;
  opcoes: OpcaoChip[];
  valor: string[];
  onChange: (v: string[]) => void;
  unico?: boolean;
  ocultarLegenda?: boolean;
}) {
  const id = useId();
  function alternar(v: string, marcado: boolean) {
    if (unico) onChange([v]);
    else onChange(marcado ? [...valor, v] : valor.filter((x) => x !== v));
  }

  return (
    <fieldset className="grid gap-2">
      <legend className={cn('text-sm font-medium', ocultarLegenda && 'sr-only')}>{legenda}</legend>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o, i) => {
          const cid = `${id}-${i}`;
          const marcado = valor.includes(o.valor);
          return (
            <label
              key={o.valor}
              htmlFor={cid}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors',
                'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                marcado
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-muted',
              )}
            >
              <input
                id={cid}
                type={unico ? 'radio' : 'checkbox'}
                name={unico ? id : undefined}
                className="sr-only"
                checked={marcado}
                onChange={(e) => alternar(o.valor, e.target.checked)}
              />
              {o.rotulo}
              {o.detalhe && (
                <span className={marcado ? 'opacity-80' : 'text-muted-foreground'}>{o.detalhe}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
