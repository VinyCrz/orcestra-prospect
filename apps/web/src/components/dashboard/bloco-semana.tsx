'use client';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  MessagesSquare,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deslocarSemana, rotuloSemana, semanaAtual } from '@/lib/semana';
import { cn } from '@/lib/utils';

interface SemanaResumo {
  semana: string;
  usuarioId: string;
  interacoes: number;
  reunioes: number;
  metaInteracoes: number;
  metaReunioes: number;
  origemMeta: 'USUARIO' | 'GLOBAL' | 'NENHUMA';
  pctInteracoes: number;
  pctReunioes: number;
  pct: number;
  metaBatida: boolean;
}
interface Ranking {
  semana: string;
  formula: string;
  itens: { posicao: number; usuarioId: string; nome: string; interacoes: number; reunioes: number; pontos: number }[];
}
interface Conquistas {
  usuarioId: string;
  itens: {
    chave: string;
    nome: string;
    descricao: string;
    icone: string;
    repetivel: boolean;
    conquistada: boolean;
    conquistadaEm: string | null;
    vezes: number;
  }[];
}

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  'calendar-check': CalendarCheck,
  map: MapIcon,
  trophy: Trophy,
  sparkles: Sparkles,
  'messages-square': MessagesSquare,
};

function Erro({ aoTentar, texto }: { aoTentar: () => void; texto: string }) {
  return (
    <div role="alert" className="text-sm">
      <p className="text-destructive">{texto}</p>
      <Button variant="link" className="h-auto p-0" onClick={aoTentar}>
        Tentar novamente
      </Button>
    </div>
  );
}

function Progresso({ rotulo, atual, meta, pct }: { rotulo: string; atual: number; meta: number; pct: number }) {
  const valor = Math.min(100, Math.round(pct));
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{rotulo}</span>
        <span className="tabular-nums text-muted-foreground">
          {atual} / {meta > 0 ? meta : 'sem meta'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${rotulo}: ${atual} de ${meta}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meta > 0 ? valor : 0}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-primary')}
          style={{ width: `${meta > 0 ? valor : 0}%` }}
        />
      </div>
    </div>
  );
}

/** Bloco "Semana": progresso vs. meta, ranking semanal e conquistas, com navegação entre semanas. */
export function BlocoSemana({
  semana,
  aoMudarSemana,
  responsavelId,
}: {
  semana: string;
  aoMudarSemana: (s: string) => void;
  responsavelId?: string;
}) {
  const { usuario } = useAuth();
  const atual = semanaAtual();
  const ehAtual = semana >= atual;
  const resumo = useQuery({
    queryKey: ['gam-semana', semana, responsavelId ?? null],
    queryFn: () =>
      api<SemanaResumo>(
        `/gamificacao/semana?semana=${semana}${responsavelId ? `&responsavelId=${responsavelId}` : ''}`,
      ),
  });
  const ranking = useQuery({
    queryKey: ['gam-ranking', semana],
    queryFn: () => api<Ranking>(`/gamificacao/ranking?semana=${semana}`),
  });
  const conquistas = useQuery({
    queryKey: ['gam-conquistas', responsavelId ?? null],
    queryFn: () => api<Conquistas>(`/gamificacao/conquistas${responsavelId ? `?usuarioId=${responsavelId}` : ''}`),
  });
  const r = resumo.data;

  return (
    <section aria-labelledby="titulo-semana" className="grid gap-4" data-testid="bloco-semana">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-semana" className="text-lg font-semibold tracking-tight">
          Semana
        </h2>
        <div className="flex items-center gap-1" role="group" aria-label="Navegar entre semanas">
          <Button
            variant="outline"
            size="icon"
            aria-label="Semana anterior"
            onClick={() => aoMudarSemana(deslocarSemana(semana, -1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-40 text-center text-sm tabular-nums" aria-live="polite" data-testid="semana-rotulo">
            {semana} · {rotuloSemana(semana)}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próxima semana"
            disabled={ehAtual}
            onClick={() => aoMudarSemana(deslocarSemana(semana, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-4" data-testid="progresso-meta">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Progresso da meta
              {r?.metaBatida && <Badge variant="success">Meta batida</Badge>}
            </CardTitle>
            <CardDescription>
              {r?.origemMeta === 'USUARIO'
                ? 'Meta individual'
                : r?.origemMeta === 'GLOBAL'
                  ? 'Meta global do time'
                  : 'Nenhuma meta definida para esta semana'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {resumo.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : resumo.isError || !r ? (
              <Erro texto="Erro ao carregar o progresso." aoTentar={() => void resumo.refetch()} />
            ) : (
              <>
                <Progresso rotulo="Interações" atual={r.interacoes} meta={r.metaInteracoes} pct={r.pctInteracoes} />
                <Progresso rotulo="Reuniões" atual={r.reunioes} meta={r.metaReunioes} pct={r.pctReunioes} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4" data-testid="ranking-semanal">
          <CardHeader>
            <CardTitle className="text-base">Ranking semanal</CardTitle>
            <CardDescription>{ranking.data?.formula ?? '1 ponto por interação e 5 por reunião'}</CardDescription>
          </CardHeader>
          <CardContent>
            {ranking.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : ranking.isError || !ranking.data ? (
              <Erro texto="Erro ao carregar o ranking." aoTentar={() => void ranking.refetch()} />
            ) : ranking.data.itens.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sem dados no período</p>
            ) : (
              <ol className="grid gap-1">
                {ranking.data.itens.map((i) => {
                  const eu = i.usuarioId === usuario?.id;
                  return (
                    <li
                      key={i.usuarioId}
                      aria-current={eu ? 'true' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-1.5 text-sm',
                        eu && 'bg-accent font-medium text-accent-foreground',
                      )}
                    >
                      <span className="w-6 text-center tabular-nums">{i.posicao}º</span>
                      <span className="min-w-0 flex-1 truncate">
                        {i.nome}
                        {eu && ' (você)'}
                      </span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {i.interacoes} int. · {i.reunioes} reun.
                      </span>
                      <span className="tabular-nums">{i.pontos} pts</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-4" data-testid="conquistas">
        <CardHeader>
          <CardTitle className="text-base">Conquistas</CardTitle>
        </CardHeader>
        <CardContent>
          {conquistas.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : conquistas.isError || !conquistas.data ? (
            <Erro texto="Erro ao carregar as conquistas." aoTentar={() => void conquistas.refetch()} />
          ) : conquistas.data.itens.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma conquista cadastrada.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {conquistas.data.itens.map((c) => {
                const Icone = ICONES[c.icone] ?? Award;
                return (
                  <li
                    key={c.chave}
                    data-conquistada={c.conquistada}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3',
                      c.conquistada ? 'border-brand-accent/60 bg-accent/50' : 'opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        c.conquistada ? 'bg-brand-accent text-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icone className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {c.nome}
                        {c.repetivel && c.vezes > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {c.vezes}x
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.descricao}</p>
                      <p className="mt-1 text-xs">
                        {c.conquistada
                          ? `Conquistada${c.conquistadaEm ? ` em ${new Date(c.conquistadaEm).toLocaleDateString('pt-BR')}` : ''}`
                          : 'Ainda não conquistada'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
