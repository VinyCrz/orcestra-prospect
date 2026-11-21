'use client';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export interface Barra {
  nome: string;
  valor: number;
  /** texto exibido ao fim da barra (padrão: o valor) */
  rotulo?: string;
}

const ALTURA_LINHA = 30;

/**
 * Card com gráfico de barras horizontais, estados de loading/erro/vazio e tabela equivalente para leitores
 * de tela (o SVG fica oculto da árvore de acessibilidade).
 */
export function GraficoBarras({
  titulo,
  descricao,
  dados,
  carregando,
  erro,
  aoTentar,
  colunaValor,
  corIndice = 1,
  formatoValor,
  testId,
  limite,
}: {
  titulo: string;
  descricao?: string;
  dados: Barra[] | undefined;
  carregando: boolean;
  erro: boolean;
  aoTentar: () => void;
  colunaValor: string;
  corIndice?: number;
  formatoValor?: (v: number) => string;
  testId: string;
  limite?: number;
}) {
  const lista = (dados ?? []).slice(0, limite);
  const vazio = !lista.length || lista.every((d) => d.valor === 0);
  const config: ChartConfig = { valor: { label: colunaValor, color: `var(--chart-${corIndice})` } };
  const fmt = formatoValor ?? ((v: number) => v.toLocaleString('pt-BR'));
  const dadosGrafico = lista.map((d) => ({ ...d, rotulo: d.rotulo ?? fmt(d.valor) }));
  return (
    <Card data-testid={testId} className="min-w-0 gap-4">
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>
        {carregando ? (
          <Skeleton className="h-48 w-full" aria-label={`Carregando ${titulo}`} />
        ) : erro ? (
          <div role="alert" className="text-sm">
            <p className="text-destructive">Erro ao carregar este gráfico.</p>
            <Button variant="link" className="h-auto p-0" onClick={aoTentar}>
              Tentar novamente
            </Button>
          </div>
        ) : vazio ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período</p>
        ) : (
          <>
            <div aria-hidden>
              <ChartContainer config={config} style={{ height: Math.max(120, lista.length * ALTURA_LINHA + 20) }}>
                <BarChart data={dadosGrafico} layout="vertical" margin={{ left: 0, right: 56, top: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={110}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent config={config} formatter={fmt} />}
                  />
                  <Bar dataKey="valor" fill="var(--color-valor)" radius={4}>
                    <LabelList dataKey="rotulo" position="right" className="fill-foreground" fontSize={11} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
            <table className="sr-only">
              <caption>{titulo}</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">{colunaValor}</th>
                </tr>
              </thead>
              <tbody>
                {dadosGrafico.map((d) => (
                  <tr key={d.nome}>
                    <th scope="row">{d.nome}</th>
                    <td>{d.rotulo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
