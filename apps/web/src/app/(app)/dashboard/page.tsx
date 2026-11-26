'use client';
import { Suspense, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MessagesSquare, Percent, Building2, CalendarCheck } from 'lucide-react';
import {
  CANAL_INTERACAO_LABEL,
  STATUS_PROSPECCAO_LABEL,
  type CanalInteracao,
  type StatusProspeccao,
} from '@orcestra/shared';
import { BlocoSemana } from '@/components/dashboard/bloco-semana';
import { GraficoBarras, type Barra } from '@/components/dashboard/grafico-barras';
import { useOpcoesResponsaveis } from '@/components/ej/use-opcoes';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hojeSP, semanaAtual, somarDias } from '@/lib/semana';

interface Dashboard {
  periodo: { inicio: string; fim: string };
  responsavelId: string | null;
  ejsPorUf: { uf: string | null; total: number; trabalhadas: number }[];
  funil: { status: StatusProspeccao; alcancaram: number; conversaoPct: number | null }[];
  coberturaFederacao: { federacaoId: string; sigla: string; nome: string; total: number; trabalhadas: number; pct: number | null }[];
  interacoesPorSdr: { usuarioId: string; nome: string; total: number; reunioes: number }[];
  respostaPorCanal: { canal: string; total: number; respondidas: number; taxaPct: number | null }[];
  motivosPerda: { motivoId: string; nome: string; total: number }[];
  tempoMedioEtapa: { status: StatusProspeccao; dias: number }[];
  respostaPorDia: { dia: number; total: number; respondidas: number; taxaPct: number | null }[];
  reuniaoPorFaixa: { faixa: string; trabalhadas: number; comReuniao: number; pct: number | null }[];
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const PERIODOS = [
  { v: '7', l: 'Últimos 7 dias' },
  { v: '30', l: 'Últimos 30 dias' },
  { v: '90', l: 'Últimos 90 dias' },
  { v: 'mes', l: 'Mês atual' },
  { v: 'custom', l: 'Personalizado' },
];
const TODOS = '__time__';
const num = new Intl.NumberFormat('pt-BR');
const pct = (n: number) => `${num.format(Math.round(n * 10) / 10)}%`;

function intervalo(periodo: string, ini: string | null, fim: string | null) {
  const hoje = hojeSP();
  if (periodo === 'custom' && ini && fim) return { inicio: ini, fim };
  if (periodo === 'mes') return { inicio: `${hoje.slice(0, 8)}01`, fim: hoje };
  const n = periodo === '7' ? 7 : periodo === '90' ? 90 : 30;
  return { inicio: somarDias(hoje, -(n - 1)), fim: hoje };
}

function Resumo({ icone: Icone, titulo, valor, carregando }: { icone: React.ComponentType<{ className?: string }>; titulo: string; valor: string; carregando: boolean }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icone className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          {carregando ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="text-2xl font-semibold tabular-nums">{valor}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Conteudo() {
  const { temPapel } = useAuth();
  const gestor = temPapel('ADMIN', 'GESTOR');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const periodo = sp.get('periodo') ?? '30';
  const sdr = gestor ? (sp.get('sdr') ?? '') : '';
  const semana = sp.get('semana') ?? semanaAtual();
  const { inicio, fim } = intervalo(periodo, sp.get('inicio'), sp.get('fim'));
  const dataInvalida = inicio > fim || somarDias(inicio, 366) < fim;

  const mudar = (kv: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(kv)) {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const resp = useOpcoesResponsaveis(gestor);
  const q = useQuery({
    queryKey: ['dashboard', inicio, fim, sdr],
    enabled: !dataInvalida,
    queryFn: () => {
      const p = new URLSearchParams({ inicio, fim });
      if (sdr) p.set('responsavelId', sdr);
      return api<Dashboard>(`/dashboard?${p.toString()}`);
    },
  });
  const d = q.data;
  const carregando = q.isLoading;
  const erro = q.isError;
  const tentar = () => void q.refetch();

  const resumo = useMemo(() => {
    if (!d) return null;
    const inter = d.interacoesPorSdr.reduce((s, x) => s + x.total, 0);
    const reun = d.interacoesPorSdr.reduce((s, x) => s + x.reunioes, 0);
    const tot = d.respostaPorCanal.reduce((s, x) => s + x.total, 0);
    const resp = d.respostaPorCanal.reduce((s, x) => s + x.respondidas, 0);
    return { inter, reun, taxa: tot > 0 ? (resp / tot) * 100 : null, trab: d.ejsPorUf.reduce((s, x) => s + x.trabalhadas, 0) };
  }, [d]);

  const dados = useMemo(() => {
    if (!d) return null;
    const porValor = (a: Barra[]) => [...a].sort((x, y) => y.valor - x.valor);
    return {
      uf: porValor(d.ejsPorUf.map((x) => ({ nome: x.uf ?? 'Sem UF', valor: x.total, rotulo: `${num.format(x.total)} (${num.format(x.trabalhadas)} trab.)` }))),
      funil: d.funil.map((x) => ({
        nome: STATUS_PROSPECCAO_LABEL[x.status] ?? x.status,
        valor: x.alcancaram,
        rotulo: `${num.format(x.alcancaram)}${x.conversaoPct === null ? '' : ` · ${pct(x.conversaoPct)}`}`,
      })),
      cobertura: porValor(d.coberturaFederacao.map((x) => ({ nome: x.sigla, valor: x.pct ?? 0, rotulo: `${pct(x.pct ?? 0)} (${num.format(x.trabalhadas)}/${num.format(x.total)})` }))),
      sdrs: porValor(d.interacoesPorSdr.map((x) => ({ nome: x.nome, valor: x.total, rotulo: `${num.format(x.total)} (${num.format(x.reunioes)} reun.)` }))),
      canais: d.respostaPorCanal.map((x) => ({ nome: CANAL_INTERACAO_LABEL[x.canal as CanalInteracao] ?? x.canal, valor: x.taxaPct ?? 0, rotulo: `${pct(x.taxaPct ?? 0)} (${num.format(x.respondidas)}/${num.format(x.total)})` })),
      motivos: porValor(d.motivosPerda.map((x) => ({ nome: x.nome, valor: x.total }))),
      dias: d.respostaPorDia.map((x) => ({ nome: DIAS[x.dia] ?? String(x.dia), valor: x.taxaPct ?? 0, rotulo: `${pct(x.taxaPct ?? 0)} (${num.format(x.respondidas)}/${num.format(x.total)})` })),
      faixas: d.reuniaoPorFaixa.map((x) => ({ nome: `Faixa ${x.faixa}`, valor: x.pct ?? 0, rotulo: `${pct(x.pct ?? 0)} (${num.format(x.comReuniao)}/${num.format(x.trabalhadas)})` })),
      tempo: d.tempoMedioEtapa.map((x) => ({ nome: STATUS_PROSPECCAO_LABEL[x.status] ?? x.status, valor: x.dias, rotulo: `${num.format(Math.round(x.dias * 10) / 10)} d` })),
    };
  }, [d]);

  const comum = { carregando, erro, aoTentar: tentar };
  const usuarios = resp.data?.usuarios ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        titulo="Dashboard"
        descricao={gestor && !sdr ? 'Visão do time inteiro.' : gestor ? 'Visão de um SDR.' : 'Seus números.'}
      />

      <div className="mb-6 flex flex-wrap items-end gap-3" role="group" aria-label="Filtros do dashboard">
        <div className="grid w-full gap-1.5 sm:w-52">
          <Label htmlFor="periodo">Período</Label>
          <Select value={periodo} onValueChange={(v) => mudar({ periodo: v === '30' ? null : v, ...(v !== 'custom' ? { inicio: null, fim: null } : { inicio: inicio, fim: fim }) })}>
            <SelectTrigger id="periodo" data-testid="seletor-periodo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.v} value={p.v}>
                  {p.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {periodo === 'custom' && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="inicio">De</Label>
              <Input id="inicio" type="date" value={inicio} max={fim} onChange={(e) => mudar({ inicio: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fim">Até</Label>
              <Input id="fim" type="date" value={fim} min={inicio} max={hojeSP()} onChange={(e) => mudar({ fim: e.target.value })} />
            </div>
          </>
        )}
        {gestor && (
          <div className="grid w-full gap-1.5 sm:w-64">
            <Label htmlFor="sdr">Visão</Label>
            <Select value={sdr || TODOS} onValueChange={(v) => mudar({ sdr: v === TODOS ? null : v })}>
              <SelectTrigger id="sdr" data-testid="seletor-sdr">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Time inteiro</SelectItem>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-xs text-muted-foreground" data-testid="periodo-texto">
          {inicio.split('-').reverse().join('/')} a {fim.split('-').reverse().join('/')}
        </p>
      </div>

      {dataInvalida ? (
        <p role="alert" className="mb-6 text-sm text-destructive">
          Período inválido: o início deve ser anterior ao fim e o intervalo ter no máximo 366 dias.
        </p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="cards-resumo">
            <Resumo icone={MessagesSquare} titulo="Interações" valor={num.format(resumo?.inter ?? 0)} carregando={carregando} />
            <Resumo icone={CalendarCheck} titulo="Reuniões" valor={num.format(resumo?.reun ?? 0)} carregando={carregando} />
            <Resumo icone={Percent} titulo="Taxa de resposta" valor={resumo?.taxa == null ? '—' : pct(resumo.taxa)} carregando={carregando} />
            <Resumo icone={Building2} titulo="EJs trabalhadas" valor={num.format(resumo?.trab ?? 0)} carregando={carregando} />
          </div>
          {erro && (
            <div role="alert" className="mb-6 rounded-md border p-4 text-sm">
              <p className="text-destructive">Erro ao carregar o dashboard.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={tentar}>
                Tentar novamente
              </Button>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <GraficoBarras {...comum} testId="g-uf" titulo="EJs por UF" descricao={gestor ? 'Total de EJs e trabalhadas' : 'Sua carteira'} dados={dados?.uf} colunaValor="EJs" corIndice={1} />
            <GraficoBarras {...comum} testId="g-funil" titulo="Funil de prospecção" descricao="EJs que alcançaram cada etapa e conversão desde a etapa anterior" dados={dados?.funil} colunaValor="Alcançaram" corIndice={3} />
            <GraficoBarras {...comum} testId="g-cobertura" titulo="Cobertura por federação" descricao="% de EJs trabalhadas (trabalhadas/total)" dados={dados?.cobertura} colunaValor="% trabalhadas" corIndice={2} formatoValor={pct} />
            {gestor && !sdr && (
              <GraficoBarras {...comum} testId="g-sdr" titulo="Interações por SDR" descricao="Total e reuniões no período" dados={dados?.sdrs} colunaValor="Interações" corIndice={5} />
            )}
            <GraficoBarras {...comum} testId="g-canal" titulo="Taxa de resposta por canal" descricao="Interações respondidas / total" dados={dados?.canais} colunaValor="% respondidas" corIndice={4} formatoValor={pct} />
            <GraficoBarras {...comum} testId="g-motivos" titulo="Motivos de perda" dados={dados?.motivos} colunaValor="EJs perdidas" corIndice={6} />
            <GraficoBarras {...comum} testId="g-dias" titulo="Melhor dia para contato" descricao="Taxa de resposta por dia da semana" dados={dados?.dias} colunaValor="% respondidas" corIndice={2} formatoValor={pct} />
            <GraficoBarras {...comum} testId="g-faixas" titulo="O score acerta?" descricao="Das EJs já trabalhadas de cada faixa, % que chegou a reunião" dados={dados?.faixas} colunaValor="% com reunião" corIndice={3} formatoValor={pct} />
            <GraficoBarras {...comum} testId="g-tempo" titulo="Tempo médio por etapa" descricao="Dias" dados={dados?.tempo} colunaValor="Dias" corIndice={1} formatoValor={(v) => `${num.format(Math.round(v * 10) / 10)} d`} />
          </div>
        </>
      )}

      <div className="mt-8">
        <BlocoSemana semana={semana} aoMudarSemana={(s) => mudar({ semana: s === semanaAtual() ? null : s })} responsavelId={sdr || undefined} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <Conteudo />
    </Suspense>
  );
}
