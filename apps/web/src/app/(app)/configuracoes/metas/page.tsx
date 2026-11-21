'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, PlayCircle, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { metaInputSchema, type UsuarioPublico } from '@orcestra/shared';
import { SomentePapeis } from '@/components/app-shell';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { deslocarSemana, segundaDaSemana, semanaAtual } from '@/lib/semana';

interface Linha {
  id: string;
  usuarioId: string | null;
  usuarioNome: string | null;
  interacoesSemana: number;
  reunioesSemana: number;
  vigenteDesde: string;
}
interface Metas {
  vigente: { interacoesSemana: number; reunioesSemana: number; vigenteDesde: string | null; origem: string };
  global: Linha[];
  overrides: Linha[];
}

const CHAVE = ['metas'];
const dataBr = (s: string) => s.split('-').reverse().join('/');

function FormMeta({
  inicial,
  rotuloBotao,
  carregando,
  aoSalvar,
  idBase,
}: {
  inicial: { interacoesSemana: number; reunioesSemana: number };
  rotuloBotao: string;
  carregando: boolean;
  aoSalvar: (v: { interacoesSemana: number; reunioesSemana: number; vigenteDesde?: string }) => void;
  idBase: string;
}) {
  const [inter, setInter] = useState(String(inicial.interacoesSemana));
  const [reun, setReun] = useState(String(inicial.reunioesSemana));
  const [vig, setVig] = useState('');
  const [erro, setErro] = useState<string>();

  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const r = metaInputSchema.safeParse({
          interacoesSemana: inter === '' ? NaN : Number(inter),
          reunioesSemana: reun === '' ? NaN : Number(reun),
          ...(vig ? { vigenteDesde: vig } : {}),
        });
        if (!r.success) return setErro(r.error.issues[0]?.message ?? 'Valores inválidos');
        setErro(undefined);
        aoSalvar(r.data);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idBase}-inter`}>Interações por semana</Label>
          <Input id={`${idBase}-inter`} type="number" inputMode="numeric" min={0} max={10000} value={inter} onChange={(e) => setInter(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idBase}-reun`}>Reuniões por semana</Label>
          <Input id={`${idBase}-reun`} type="number" inputMode="numeric" min={0} max={1000} value={reun} onChange={(e) => setReun(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idBase}-vig`}>Vigente desde (segunda)</Label>
          <Input id={`${idBase}-vig`} type="date" value={vig} min={segundaAtual()} onChange={(e) => setVig(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Em branco, vale a partir da segunda-feira da semana atual. A data deve ser uma segunda-feira, hoje ou futura.
      </p>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <div>
        <Button type="submit" disabled={carregando}>
          {carregando ? <Loader2 className="animate-spin" /> : <Save />}
          {rotuloBotao}
        </Button>
      </div>
    </form>
  );
}

const segundaAtual = () => segundaDaSemana(semanaAtual());

function Conteudo({ metas }: { metas: Metas }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<{ id: string; nome: string; inicial: { interacoesSemana: number; reunioesSemana: number } } | null>(null);

  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api<UsuarioPublico[]>('/usuarios') });
  const sdrs = (usuarios.data ?? []).filter((u) => u.papel === 'SDR' && u.ativo);

  const erroMsg = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar');
  const ok = (msg: string) => {
    void qc.invalidateQueries({ queryKey: CHAVE });
    void qc.invalidateQueries({ queryKey: ['gam-semana'] });
    toast.success(msg);
  };
  const salvarGlobal = useMutation({
    mutationFn: (json: unknown) => api('/metas/global', { method: 'PUT', json }),
    onSuccess: () => ok('Meta global salva'),
    onError: erroMsg,
  });
  const salvarSdr = useMutation({
    mutationFn: ({ id, json }: { id: string; json: unknown }) => api(`/metas/usuarios/${id}`, { method: 'PUT', json }),
    onSuccess: () => {
      setEditando(null);
      ok('Meta do SDR salva');
    },
    onError: erroMsg,
  });
  const remover = useMutation({
    mutationFn: (id: string) => api(`/metas/usuarios/${id}`, { method: 'DELETE' }),
    onSuccess: () => ok('Meta individual removida; vale a global'),
    onError: erroMsg,
  });
  const avaliar = useMutation({
    mutationFn: () => api(`/gamificacao/avaliar-semana?semana=${deslocarSemana(semanaAtual(), -1)}`, { method: 'POST' }),
    onSuccess: () => toast.success('Avaliação da semana anterior enfileirada'),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao avaliar a semana'),
  });

  const v = metas.vigente;
  const atualGlobal = metas.global[0];
  const overrideDe = (id: string) => metas.overrides.find((o) => o.usuarioId === id);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Meta global do time</CardTitle>
          <CardDescription>
            Vigente hoje: {v.origem === 'NENHUMA' ? 'nenhuma meta definida' : `${v.interacoesSemana} interações e ${v.reunioesSemana} reuniões por semana`}
            {v.vigenteDesde ? ` (desde ${dataBr(v.vigenteDesde)})` : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormMeta
            idBase="global"
            inicial={atualGlobal ?? { interacoesSemana: 0, reunioesSemana: 0 }}
            rotuloBotao="Salvar meta global"
            carregando={salvarGlobal.isPending}
            aoSalvar={(json) => salvarGlobal.mutate(json)}
          />
          {metas.global.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="historico-global">
                <caption className="mb-1 text-left text-xs text-muted-foreground">Histórico de vigências</caption>
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th scope="col" className="py-1 pr-4 font-medium">Desde</th>
                    <th scope="col" className="py-1 pr-4 font-medium">Interações</th>
                    <th scope="col" className="py-1 font-medium">Reuniões</th>
                  </tr>
                </thead>
                <tbody>
                  {metas.global.map((g) => (
                    <tr key={g.id} className="border-t">
                      <td className="py-1 pr-4 tabular-nums">{dataBr(g.vigenteDesde)}</td>
                      <td className="py-1 pr-4 tabular-nums">{g.interacoesSemana}</td>
                      <td className="py-1 tabular-nums">{g.reunioesSemana}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metas individuais</CardTitle>
          <CardDescription>Sobrescrevem a meta global para o SDR. Remover volta a valer a global.</CardDescription>
        </CardHeader>
        <CardContent>
          {usuarios.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : usuarios.isError ? (
            <div role="alert" className="text-sm">
              <p className="text-destructive">Erro ao carregar os SDRs.</p>
              <Button variant="link" className="h-auto p-0" onClick={() => void usuarios.refetch()}>Tentar novamente</Button>
            </div>
          ) : sdrs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum SDR ativo.</p>
          ) : (
            <ul className="divide-y" data-testid="lista-overrides">
              {sdrs.map((u) => {
                const o = overrideDe(u.id);
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{u.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {o
                          ? `${o.interacoesSemana} interações e ${o.reunioesSemana} reuniões (desde ${dataBr(o.vigenteDesde)})`
                          : 'Usa a meta global'}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditando({
                          id: u.id,
                          nome: u.nome,
                          inicial: o ?? atualGlobal ?? { interacoesSemana: 0, reunioesSemana: 0 },
                        })
                      }
                    >
                      <Pencil /> {o ? 'Editar' : 'Definir'}
                    </Button>
                    {o && (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Remover meta individual de ${u.nome}`}
                        disabled={remover.isPending}
                        onClick={() => {
                          if (window.confirm(`Remover a meta individual de ${u.nome}?`)) remover.mutate(u.id);
                        }}
                      >
                        <Trash2 /> Remover
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avaliação de conquistas</CardTitle>
          <CardDescription>
            A avaliação da semana ocorre automaticamente; use o botão para reprocessar a semana anterior ({deslocarSemana(semanaAtual(), -1)}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => avaliar.mutate()} disabled={avaliar.isPending}>
            {avaliar.isPending ? <Loader2 className="animate-spin" /> : <PlayCircle />}
            Avaliar semana anterior
          </Button>
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meta de {editando?.nome}</DialogTitle>
            <DialogDescription>Meta semanal individual.</DialogDescription>
          </DialogHeader>
          {editando && (
            <FormMeta
              key={editando.id}
              idBase="sdr"
              inicial={editando.inicial}
              rotuloBotao="Salvar"
              carregando={salvarSdr.isPending}
              aoSalvar={(json) => salvarSdr.mutate({ id: editando.id, json })}
            />
          )}
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MetasPage() {
  const q = useQuery({ queryKey: CHAVE, queryFn: () => api<Metas>('/metas') });
  return (
    <SomentePapeis papeis={['ADMIN']}>
      <div className="mx-auto max-w-4xl">
        <PageHeader titulo="Metas do time" descricao="Metas semanais de interações e reuniões usadas na gamificação." />
        {q.isLoading ? (
          <div className="grid gap-4" aria-busy="true" aria-label="Carregando metas">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : q.isError || !q.data ? (
          <div className="rounded-md border p-6 text-center" role="alert">
            <p className="text-sm text-destructive">Erro ao carregar as metas.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void q.refetch()}>Tentar novamente</Button>
          </div>
        ) : (
          <Conteudo metas={q.data} />
        )}
      </div>
    </SomentePapeis>
  );
}
