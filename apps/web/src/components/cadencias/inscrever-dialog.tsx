'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Campo } from '@/components/form/campo';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import type { ContatoEj } from '@/lib/tipos';
import type { Cadencia, ResultadoInscricao } from '@/lib/tipos-cadencias';

const SEM_CONTATO = '__sem__';

export function useCadencias(ativa?: boolean) {
  return useQuery({
    queryKey: ['cadencias', ativa ?? 'todas'],
    queryFn: () =>
      api<Cadencia[]>(`/cadencias${ativa === undefined ? '' : `?ativa=${ativa}`}`),
  });
}

/** Inscreve 1..N EJs numa cadência. Com 1 EJ permite escolher o contato (opt-out desabilitado). */
export function InscreverDialog({
  aberto,
  onFechar,
  ejIds,
  aoConcluir,
}: {
  aberto: boolean;
  onFechar: () => void;
  ejIds: string[];
  aoConcluir?: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        {aberto && <Corpo ejIds={ejIds} onFechar={onFechar} aoConcluir={aoConcluir} />}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({
  ejIds,
  onFechar,
  aoConcluir,
}: {
  ejIds: string[];
  onFechar: () => void;
  aoConcluir?: () => void;
}) {
  const qc = useQueryClient();
  const unica = ejIds.length === 1 ? ejIds[0]! : null;
  const cads = useCadencias(true);
  const contatos = useQuery({
    queryKey: ['contatos', unica],
    queryFn: () => api<ContatoEj[]>(`/empresas-juniores/${unica}/contatos`),
    enabled: !!unica,
  });
  const [cadenciaId, setCadenciaId] = useState('');
  const [contatoId, setContatoId] = useState(SEM_CONTATO);
  const [resultado, setResultado] = useState<ResultadoInscricao | null>(null);

  const m = useMutation({
    mutationFn: () =>
      api<ResultadoInscricao>(`/cadencias/${cadenciaId}/inscrever`, {
        method: 'POST',
        json: {
          ejIds,
          ...(unica && contatoId !== SEM_CONTATO ? { contatoId } : {}),
        },
      }),
    onSuccess: (r) => {
      for (const k of ['agenda', 'tarefas-contador', 'timeline', 'inscricoes-ej', 'cadencias', 'inscricoes'])
        void qc.invalidateQueries({ queryKey: [k] });
      setResultado(r);
      if (r.inscritas) toast.success(`${r.inscritas} inscrita(s)`);
      aoConcluir?.();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao inscrever'),
  });

  if (resultado) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Resultado da inscrição</DialogTitle>
          <DialogDescription>
            {resultado.inscritas} inscrita(s), {resultado.ignoradas.length} ignorada(s).
          </DialogDescription>
        </DialogHeader>
        {resultado.ignoradas.length > 0 && (
          <ul className="grid max-h-60 gap-1 overflow-y-auto text-sm" data-testid="inscricao-ignoradas">
            {resultado.ignoradas.map((i) => (
              <li key={i.ejId} className="rounded-md border p-2">
                <span className="text-muted-foreground">{i.ejId}</span>: {i.motivo}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </>
    );
  }

  const lista = cads.data ?? [];
  return (
    <>
      <DialogHeader>
        <DialogTitle>Inscrever em cadência</DialogTitle>
        <DialogDescription>
          {ejIds.length} EJ{ejIds.length === 1 ? '' : 's'}. Serão criadas as tarefas de cada passo na
          agenda do responsável. Nada é enviado automaticamente.
        </DialogDescription>
      </DialogHeader>
      {cads.isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : cads.isError ? (
        <p className="text-sm text-destructive" role="alert">
          Erro ao carregar as cadências.
        </p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma cadência ativa disponível.</p>
      ) : (
        <div className="grid gap-4">
          <Campo id="insc-cad" label="Cadência">
            <Select value={cadenciaId} onValueChange={setCadenciaId}>
              <SelectTrigger id="insc-cad">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {lista.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} ({c.passos.length} passos)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          {unica && (
            <Campo id="insc-contato" label="Contato (opcional)">
              <Select value={contatoId} onValueChange={setContatoId}>
                <SelectTrigger id="insc-contato">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CONTATO}>Contato principal / automático</SelectItem>
                  {(contatos.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={c.optOut}>
                      {c.nome}
                      {c.optOut ? ' (opt-out)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button onClick={() => m.mutate()} disabled={!cadenciaId || m.isPending}>
          {m.isPending && <Loader2 className="animate-spin" />}
          Inscrever
        </Button>
      </DialogFooter>
    </>
  );
}
