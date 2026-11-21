'use client';
import { useId, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

export interface OpcaoCheck {
  valor: string;
  rotulo: string;
  detalhe?: string;
}

/** Grupo de checkboxes (multisseleção) com busca opcional e rolagem. */
export function CheckGroup({
  legenda,
  opcoes,
  valor,
  onChange,
  buscavel = false,
  carregando = false,
  vazio = 'Sem opções',
}: {
  legenda: string;
  opcoes: OpcaoCheck[];
  valor: string[];
  onChange: (v: string[]) => void;
  buscavel?: boolean;
  carregando?: boolean;
  vazio?: string;
}) {
  const id = useId();
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const visiveis = termo ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(termo)) : opcoes;

  function alternar(v: string, marcado: boolean) {
    onChange(marcado ? [...valor, v] : valor.filter((x) => x !== v));
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">
        {legenda}
        {valor.length > 0 && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">({valor.length})</span>
        )}
      </legend>
      {buscavel && (
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          aria-label={`Buscar em ${legenda}`}
          className="h-8"
        />
      )}
      <div className="max-h-44 overflow-y-auto rounded-md border p-2">
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vazio}</p>
        ) : (
          <ul className="grid gap-1.5">
            {visiveis.map((o, i) => {
              const cid = `${id}-${i}`;
              return (
                <li key={o.valor} className="flex items-center gap-2">
                  <Checkbox
                    id={cid}
                    checked={valor.includes(o.valor)}
                    onChange={(e) => alternar(o.valor, e.target.checked)}
                  />
                  <label htmlFor={cid} className="flex-1 cursor-pointer text-sm">
                    {o.rotulo}
                    {o.detalhe && (
                      <span className="ml-1 text-xs text-muted-foreground">{o.detalhe}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
