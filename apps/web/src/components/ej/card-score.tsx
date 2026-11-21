import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FaixaBadge } from '@/components/faixa-badge';
import type { EmpresaJuniorDetalhe } from '@/lib/tipos';

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Explicação do score de ICP: pontos/peso e motivo por critério. */
export function CardScore({ ej }: { ej: EmpresaJuniorDetalhe }) {
  const detalhe = ej.scoreDetalhe ?? [];
  return (
    <Card data-testid="card-score">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Score de ICP
          <FaixaBadge faixa={ej.faixaIcp} />
        </CardTitle>
        <CardDescription>
          {ej.scoreCalculadoEm
            ? `Calculado em ${dataHora.format(new Date(ej.scoreCalculadoEm))}`
            : 'Ainda não calculado.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-3xl font-semibold tabular-nums">
          {ej.scoreIcp}
          <span className="text-base font-normal text-muted-foreground"> / 100</span>
        </p>
        {detalhe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem detalhamento disponível.</p>
        ) : (
          <ul className="divide-y" aria-label="Pontuação por critério">
            {detalhe.map((d) => (
              <li key={d.chave} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.nome}</p>
                  <p
                    className={
                      d.motivo === 'sem dado'
                        ? 'text-xs text-muted-foreground italic'
                        : 'text-xs text-muted-foreground'
                    }
                  >
                    {d.motivo}
                  </p>
                </div>
                <span
                  className={
                    d.pontos > 0
                      ? 'text-sm font-medium tabular-nums'
                      : 'text-sm text-muted-foreground tabular-nums'
                  }
                >
                  {num.format(d.pontos)} / {num.format(d.peso)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
