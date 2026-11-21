'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { criarMotivoPerdaSchema } from '@orcestra/shared';
import { SomentePapeis } from '@/components/app-shell';
import { Campo } from '@/components/form/campo';
import { useMotivosPerda } from '@/components/funil/use-motivos';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import type { MotivoPerda } from '@/lib/tipos-funil';

function MotivoDialog({ motivo, onFechar }: { motivo: MotivoPerda | 'novo' | null; onFechar: () => void }) {
  return (
    <Dialog open={!!motivo} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>{motivo && <Form motivo={motivo} onFechar={onFechar} />}</DialogContent>
    </Dialog>
  );
}

function Form({ motivo, onFechar }: { motivo: MotivoPerda | 'novo'; onFechar: () => void }) {
  const qc = useQueryClient();
  const edicao = motivo !== 'novo';
  const [nome, setNome] = useState(edicao ? motivo.nome : '');
  const [erro, setErro] = useState('');
  const m = useMutation({
    mutationFn: () =>
      edicao
        ? api(`/motivos-perda/${motivo.id}`, { method: 'PATCH', json: { nome } })
        : api('/motivos-perda', { method: 'POST', json: { nome } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['motivos-perda'] });
      toast.success(edicao ? 'Motivo renomeado' : 'Motivo criado');
      onFechar();
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao salvar'),
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>{edicao ? 'Renomear motivo' : 'Novo motivo de perda'}</DialogTitle>
        <DialogDescription>Aparece na lista ao marcar uma EJ como perdida.</DialogDescription>
      </DialogHeader>
      <form
        id="form-motivo"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const r = criarMotivoPerdaSchema.safeParse({ nome });
          if (!r.success) return setErro(r.error.issues[0]?.message ?? 'Nome inválido');
          setErro('');
          m.mutate();
        }}
      >
        <Campo id="motivo-nome" label="Nome" erro={erro}>
          <Input
            id="motivo-nome"
            maxLength={80}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={!!erro}
          />
        </Campo>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" form="form-motivo" disabled={m.isPending}>
          {m.isPending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </>
  );
}

function AlternarAtivo({ m }: { m: MotivoPerda }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api(`/motivos-perda/${m.id}`, { method: 'PATCH', json: { ativo: !m.ativo } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['motivos-perda'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar'),
  });
  return (
    <Button size="sm" variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending}>
      {mut.isPending && <Loader2 className="animate-spin" />}
      {m.ativo ? 'Desativar' : 'Ativar'}
    </Button>
  );
}

export default function MotivosPerdaPage() {
  const q = useMotivosPerda(true);
  const [edicao, setEdicao] = useState<MotivoPerda | 'novo' | null>(null);
  return (
    <SomentePapeis papeis={['ADMIN']}>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          titulo="Motivos de perda"
          descricao="Lista usada ao marcar uma Empresa Júnior como perdida. Motivos desativados deixam de ser oferecidos."
          acoes={
            <Button size="sm" onClick={() => setEdicao('novo')}>
              <Plus /> Novo motivo
            </Button>
          }
        />
        {q.isLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : q.isError ? (
          <div className="rounded-md border p-6 text-center" role="alert">
            <p className="text-sm text-destructive">Erro ao carregar os motivos.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void q.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum motivo cadastrado.</p>
        ) : (
          <Card>
            <ul className="divide-y">
              {q.data!.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  data-testid="motivo"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.nome}</span>
                    {!m.ativo && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEdicao(m)}
                      aria-label={`Renomear ${m.nome}`}
                    >
                      <Pencil /> Renomear
                    </Button>
                    <AlternarAtivo m={m} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <MotivoDialog motivo={edicao} onFechar={() => setEdicao(null)} />
      </div>
    </SomentePapeis>
  );
}
