'use client';

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';
import {
  FASE_TAREFA_LABEL, FASES_TAREFA, PRIORIDADE_TAREFA_LABEL, type FaseTarefa,
} from '@orcestra/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TarefaAgenda } from '@/lib/tipos-funil';

export type FaseNovaTarefa = 'IDEIA' | 'NAO_INICIADA' | 'EM_ANDAMENTO';
const dataBr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

function Cartao({ tarefa, onAbrir, movendo }: {
  tarefa: TarefaAgenda;
  onAbrir: (tarefa: TarefaAgenda) => void;
  movendo: boolean;
}) {
  const drag = useDraggable({ id: tarefa.id, disabled: !tarefa.podeEditar || movendo });
  return (
    <li ref={drag.setNodeRef}
      style={{ transform: CSS.Translate.toString(drag.transform) }}
      className={cn('relative flex gap-1 rounded-lg border bg-card p-2', drag.isDragging && 'z-10 shadow-lg')}>
      <button type="button" onClick={() => onAbrir(tarefa)}
        className="grid min-w-0 flex-1 gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-ring">
        <span className="text-sm font-medium [overflow-wrap:anywhere]">{tarefa.titulo}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant={tarefa.prioridade === 'ALTA' ? 'destructive' : 'secondary'}>
            {PRIORIDADE_TAREFA_LABEL[tarefa.prioridade]}
          </Badge>
          {tarefa.vencimento ? dataBr.format(new Date(tarefa.vencimento)) : 'Sem data'}
        </span>
        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{tarefa.responsavel.nome}</span>
        {tarefa.subtarefas.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {tarefa.subtarefas.filter((s) => s.concluida).length}/{tarefa.subtarefas.length} subtarefas
          </span>
        )}
      </button>
      {tarefa.podeEditar && (
        <button type="button" ref={drag.setActivatorNodeRef} {...drag.attributes} {...drag.listeners}
          aria-label={`Arrastar ${tarefa.titulo}`} disabled={movendo}
          className="self-start touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing">
          <GripVertical className="size-4" />
        </button>
      )}
    </li>
  );
}

function Coluna({ fase, tarefas, onAbrir, onCriar, movendo }: {
  fase: FaseTarefa;
  tarefas: TarefaAgenda[];
  onAbrir: (tarefa: TarefaAgenda) => void;
  onCriar: (fase: FaseNovaTarefa) => void;
  movendo: boolean;
}) {
  const zona = useDroppable({ id: fase });
  return (
    <section ref={zona.setNodeRef} aria-label={FASE_TAREFA_LABEL[fase]}
      className={cn('min-h-52 rounded-xl border bg-muted/40 p-2.5', zona.isOver && 'border-primary bg-primary/10')}>
      <div className="mb-2 flex min-h-8 items-center gap-1.5">
        <h2 className="flex-1 text-sm font-semibold">{FASE_TAREFA_LABEL[fase]}</h2>
        {(fase === 'IDEIA' || fase === 'NAO_INICIADA' || fase === 'EM_ANDAMENTO') && (
          <Button type="button" size="icon" variant="ghost" className="size-7"
            aria-label={`Nova tarefa em ${FASE_TAREFA_LABEL[fase]}`} onClick={() => onCriar(fase)}>
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      <ul className="grid gap-2">
        {tarefas.map((tarefa) => <Cartao key={tarefa.id} tarefa={tarefa} movendo={movendo} onAbrir={onAbrir} />)}
      </ul>
    </section>
  );
}

export function KanbanTarefas({ tarefas, onAbrir, onCriar, onMover, movendo }: {
  tarefas: TarefaAgenda[];
  onAbrir: (tarefa: TarefaAgenda) => void;
  onCriar: (fase: FaseNovaTarefa) => void;
  onMover: (id: string, fase: FaseTarefa) => void;
  movendo: boolean;
}) {
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  return (
    <DndContext sensors={sensores} onDragEnd={({ active, over }) => {
      const tarefa = tarefas.find((item) => item.id === active.id);
      const fase = FASES_TAREFA.find((item) => item === over?.id);
      if (tarefa?.podeEditar && fase && tarefa.fase !== fase) onMover(tarefa.id, fase);
    }}>
      <div className="overflow-x-auto pb-3">
        <div className="grid min-w-[56rem] grid-cols-5 items-start gap-2.5">
          {FASES_TAREFA.map((fase) => (
            <Coluna key={fase} fase={fase} tarefas={tarefas.filter((t) => t.fase === fase)}
              onAbrir={onAbrir} onCriar={onCriar} movendo={movendo} />
          ))}
        </div>
      </div>
    </DndContext>
  );
}
