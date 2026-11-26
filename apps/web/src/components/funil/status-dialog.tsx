'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { STATUS_PROSPECCAO, STATUS_PROSPECCAO_LABEL, type StatusProspeccao } from '@orcestra/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useMotivosPerda } from './use-motivos';

export interface ExtrasStatus {
  motivoPerdaId: string;
  motivoPerdaDetalhe: string;
  dataRetornoNutricao: string;
}
export const EXTRAS_VAZIOS: ExtrasStatus = {
  motivoPerdaId: '',
  motivoPerdaDetalhe: '',
  dataRetornoNutricao: '',
};

export const hojeIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** O que falta para o status escolhido ser aceito pela API (null = completo). */
export function faltaParaStatus(status: StatusProspeccao | '', e: ExtrasStatus): string | null {
  if (status === 'PERDIDA' && !e.motivoPerdaId) return 'Selecione o motivo da perda';
  if (status === 'NUTRICAO' && !e.dataRetornoNutricao) return 'Informe a data de retorno';
  return null;
}

/** Corpo com os campos extras relevantes ao status (para PATCH /status e ações em massa). */
export function extrasParaApi(status: StatusProspeccao | '', e: ExtrasStatus) {
  if (status === 'PERDIDA')
    return { motivoPerdaId: e.motivoPerdaId, motivoPerdaDetalhe: e.motivoPerdaDetalhe.trim() || null };
  if (status === 'NUTRICAO') return { dataRetornoNutricao: e.dataRetornoNutricao };
  return {};
}

/** Campos condicionais: motivo (+ detalhe) para PERDIDA, data de retorno para NUTRICAO. */
export function CamposExtraStatus({
  status,
  valor,
  onChange,
  prefixo = 'status',
}: {
  status: StatusProspeccao | '';
  valor: ExtrasStatus;
  onChange: (v: ExtrasStatus) => void;
  prefixo?: string;
}) {
  const motivos = useMotivosPerda(false, status === 'PERDIDA');
  if (status === 'PERDIDA') {
    return (
      <>
        <div className="grid gap-2">
          <Label htmlFor={`${prefixo}-motivo`}>Motivo da perda</Label>
          <Select
            value={valor.motivoPerdaId}
            onValueChange={(v) => onChange({ ...valor, motivoPerdaId: v })}
          >
            <SelectTrigger id={`${prefixo}-motivo`}>
              <SelectValue
                placeholder={motivos.isLoading ? 'Carregando…' : 'Selecione o motivo…'}
              />
            </SelectTrigger>
            <SelectContent>
              {(motivos.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {motivos.isError && (
            <p className="text-sm text-destructive" role="alert">
              Não foi possível carregar os motivos.
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefixo}-detalhe`}>Detalhe (opcional)</Label>
          <Textarea
            id={`${prefixo}-detalhe`}
            maxLength={500}
            value={valor.motivoPerdaDetalhe}
            onChange={(e) => onChange({ ...valor, motivoPerdaDetalhe: e.target.value })}
          />
        </div>
      </>
    );
  }
  if (status === 'NUTRICAO') {
    return (
      <div className="grid gap-2">
        <Label htmlFor={`${prefixo}-retorno`}>Data de retorno</Label>
        <Input
          id={`${prefixo}-retorno`}
          type="date"
          min={hojeIso()}
          value={valor.dataRetornoNutricao}
          onChange={(e) => onChange({ ...valor, dataRetornoNutricao: e.target.value })}
        />
      </div>
    );
  }
  if (status === 'NAO_TRABALHADA') {
    return (
      <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        A EJ sai do funil e fica <strong>sem responsável</strong>, livre para outra pessoa pegar. As cadências
        dela são encerradas.
      </p>
    );
  }
  return null;
}

export interface DadosStatus {
  status: StatusProspeccao;
  motivoPerdaId?: string;
  motivoPerdaDetalhe?: string | null;
  dataRetornoNutricao?: string;
}

/**
 * Diálogo reutilizável de mudança de status. Com `statusAlvo` o status é fixo (kanban);
 * sem ele o usuário escolhe (detalhe da EJ).
 */
export function MudarStatusDialog({
  aberto,
  onFechar,
  titulo = 'Mudar status',
  descricao,
  statusAtual,
  statusAlvo,
  pendente,
  erro,
  onConfirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo?: string;
  descricao?: React.ReactNode;
  statusAtual?: StatusProspeccao;
  statusAlvo?: StatusProspeccao;
  pendente?: boolean;
  erro?: string | null;
  onConfirmar: (d: DadosStatus) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        {aberto && (
          <Corpo
            titulo={titulo}
            descricao={descricao}
            statusAtual={statusAtual}
            statusAlvo={statusAlvo}
            pendente={pendente}
            erro={erro}
            onFechar={onFechar}
            onConfirmar={onConfirmar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({
  titulo,
  descricao,
  statusAtual,
  statusAlvo,
  pendente,
  erro,
  onFechar,
  onConfirmar,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  statusAtual?: StatusProspeccao;
  statusAlvo?: StatusProspeccao;
  pendente?: boolean;
  erro?: string | null;
  onFechar: () => void;
  onConfirmar: (d: DadosStatus) => void;
}) {
  const [status, setStatus] = useState<StatusProspeccao | ''>(statusAlvo ?? '');
  const [extras, setExtras] = useState<ExtrasStatus>(EXTRAS_VAZIOS);
  const falta = faltaParaStatus(status, extras);
  const pronto = status !== '' && !falta && (statusAlvo !== undefined || status !== statusAtual);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription>
          {descricao ??
            (statusAlvo
              ? `Mover para "${STATUS_PROSPECCAO_LABEL[statusAlvo]}".`
              : 'Escolha o novo status da Empresa Júnior.')}
        </DialogDescription>
      </DialogHeader>
      <form
        id="form-status"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pronto) return;
          onConfirmar({ status: status as StatusProspeccao, ...extrasParaApi(status, extras) });
        }}
      >
        {!statusAlvo && (
          <div className="grid gap-2">
            <Label htmlFor="status-novo">Novo status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusProspeccao)}>
              <SelectTrigger id="status-novo">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_PROSPECCAO.map((s) => (
                  <SelectItem key={s} value={s} disabled={s === statusAtual}>
                    {STATUS_PROSPECCAO_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <CamposExtraStatus status={status} valor={extras} onChange={setExtras} />
        {erro && (
          <p className="text-sm text-destructive" role="alert">
            {erro}
          </p>
        )}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" form="form-status" disabled={!pronto || pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Confirmar
        </Button>
      </DialogFooter>
    </>
  );
}
