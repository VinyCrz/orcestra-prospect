'use client';

import { useRef, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TarefaAgenda } from '@/lib/tipos-funil';

const fuso = 'America/Sao_Paulo';
const dataCivil = new Intl.DateTimeFormat('en-CA', {
  timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
});
const nomeMes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const nomeDia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' });
const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const dataUtcIso = (d: Date) => d.toISOString().slice(0, 10);
export const hojeAgenda = () => dataCivil.format(new Date());

export function mesAgenda(data: string, delta = 0) {
  const [ano, mes] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1 + delta, 1));
}

export function CalendarioTarefas({
  mes, tarefas, carregando, onMes, onCriar, onAbrir,
}: {
  mes: string;
  tarefas: TarefaAgenda[];
  carregando: boolean;
  onMes: (mes: string) => void;
  onCriar: (data: string) => void;
  onAbrir: (tarefa: TarefaAgenda) => void;
}) {
  const gesto = useRef<{ id: number; x: number; y: number; horizontal: boolean } | null>(null);
  const bloquearClique = useRef(false);
  const primeiroDia = mesAgenda(mes);
  const ultimoDia = new Date(mesAgenda(mes, 1).getTime() - 86_400_000).getUTCDate();
  const hoje = hojeAgenda();
  const porDia = new Map<string, TarefaAgenda[]>();
  for (const tarefa of tarefas) {
    if (!tarefa.vencimento) continue;
    const data = dataCivil.format(new Date(tarefa.vencimento));
    const doDia = porDia.get(data);
    if (doDia) doDia.push(tarefa);
    else porDia.set(data, [tarefa]);
  }

  function iniciarGesto(e: PointerEvent<HTMLElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    bloquearClique.current = false;
    gesto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, horizontal: false };
  }

  function acompanharGesto(e: PointerEvent<HTMLElement>) {
    const inicio = gesto.current;
    if (!inicio || inicio.id !== e.pointerId || inicio.horizontal) return;
    const dx = Math.abs(e.clientX - inicio.x);
    const dy = Math.abs(e.clientY - inicio.y);
    if (dy > 12 && dy >= dx) {
      gesto.current = null;
    } else if (dx > 12 && dx > dy * 1.25) {
      inicio.horizontal = true;
      bloquearClique.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function terminarGesto(e: PointerEvent<HTMLElement>) {
    const inicio = gesto.current;
    if (!inicio || inicio.id !== e.pointerId) return;
    gesto.current = null;
    const dx = e.clientX - inicio.x;
    if (inicio.horizontal && Math.abs(dx) >= 64) {
      onMes(dataUtcIso(mesAgenda(mes, dx < 0 ? 1 : -1)));
    }
  }

  return (
    <section
      aria-label="Calendário de tarefas"
      className="touch-pan-y select-none rounded-xl border bg-card"
      onPointerDown={iniciarGesto}
      onPointerMove={acompanharGesto}
      onPointerUp={terminarGesto}
      onPointerCancel={() => { gesto.current = null; }}
      onClickCapture={(e) => {
        if (e.detail && bloquearClique.current) {
          bloquearClique.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:px-4">
        <h2 className="text-base font-semibold capitalize">{nomeMes.format(primeiroDia)}</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => onMes(dataUtcIso(mesAgenda(hoje)))}>Hoje</Button>
          <Button size="icon" variant="ghost" aria-label="Mês anterior" onClick={() => onMes(dataUtcIso(mesAgenda(mes, -1)))}>
            <ChevronLeft />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Próximo mês" onClick={() => onMes(dataUtcIso(mesAgenda(mes, 1)))}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      {carregando && <p role="status" className="sr-only">Carregando tarefas</p>}
      <div aria-busy={carregando} className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-7">
        {semana.map((dia) => (
          <div key={dia} className="hidden bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:block">{dia}</div>
        ))}
        {Array.from({ length: primeiroDia.getUTCDay() }, (_, i) => (
          <div key={`vazio-${i}`} aria-hidden className="hidden bg-muted/40 sm:block" />
        ))}
        {Array.from({ length: ultimoDia }, (_, i) => {
          const dia = i + 1;
          const data = new Date(Date.UTC(primeiroDia.getUTCFullYear(), primeiroDia.getUTCMonth(), dia));
          const iso = dataUtcIso(data);
          return (
            <div key={iso} className={cn('min-w-0 bg-card px-2 pb-2 pt-1 sm:min-h-24', iso === hoje && 'bg-primary/5')}>
              <div className="mb-1 flex items-center justify-between gap-1">
                <span aria-current={iso === hoje ? 'date' : undefined}
                  className={cn('inline-flex items-center gap-1 text-xs font-medium', iso === hoje && 'text-primary')}>
                  <span className="tabular-nums">{dia}</span>
                  <span className="capitalize text-muted-foreground sm:hidden">{semana[data.getUTCDay()]}</span>
                </span>
                <Button variant="ghost" size="icon" className="size-7"
                  aria-label={`Nova tarefa em ${nomeDia.format(data)}, ${dia}`}
                  onClick={() => onCriar(iso)}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <ul className="grid gap-1">
                {porDia.get(iso)?.map((tarefa) => (
                  <li key={tarefa.id}>
                    <button type="button" onClick={() => onAbrir(tarefa)}
                      className={cn(
                        'block w-full rounded bg-accent px-1.5 py-1 text-left text-xs leading-tight [overflow-wrap:anywhere] hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring',
                        tarefa.concluida && 'text-muted-foreground',
                      )}>
                      {tarefa.titulo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {Array.from({ length: (7 - (primeiroDia.getUTCDay() + ultimoDia) % 7) % 7 }, (_, i) => (
          <div key={`fim-${i}`} aria-hidden className="hidden bg-muted/40 sm:block" />
        ))}
      </div>
    </section>
  );
}
