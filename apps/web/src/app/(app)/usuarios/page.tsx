'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Loader2, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import {
  criarUsuarioSchema,
  PAPEIS,
  PAPEL_LABEL,
  papelSchema,
  type CriarUsuarioInput,
  type UsuarioPublico,
} from '@orcestra/shared';
import { SomentePapeis } from '@/components/app-shell';
import { Campo } from '@/components/form/campo';
import { RequisitosSenha } from '@/components/form/requisitos-senha';
import { PageHeader } from '@/components/page-header';
import { CodigoEquipeCard } from '@/components/usuarios/codigo-equipe-card';
import { LinkSenhaDialog } from '@/components/usuarios/link-senha-dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const edicaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome'),
  papel: papelSchema,
});
type Edicao = z.infer<typeof edicaoSchema>;

function SelectPapel({
  value,
  onChange,
  id,
}: {
  value?: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        {PAPEIS.map((p) => (
          <SelectItem key={p} value={p}>
            {PAPEL_LABEL[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DialogCriar({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient();
  const form = useForm<CriarUsuarioInput>({
    resolver: zodResolver(criarUsuarioSchema),
    defaultValues: { papel: 'SDR' },
  });
  const m = useMutation({
    mutationFn: (d: CriarUsuarioInput) =>
      api<UsuarioPublico>('/usuarios', { method: 'POST', json: d }),
    onSuccess: (u) => {
      toast.success(`Usuário ${u.nome} criado`);
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      form.reset({ papel: 'SDR' });
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao criar usuário'),
  });
  const { errors } = form.formState;
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            O usuário poderá entrar com o e-mail e a senha definidos aqui.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((d) => m.mutate(d))} className="grid gap-4" noValidate>
          <Campo id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" {...form.register('nome')} />
          </Campo>
          <Campo id="email" label="E-mail" erro={errors.email?.message}>
            <Input id="email" type="email" {...form.register('email')} />
          </Campo>
          <Campo id="senha" label="Senha inicial" erro={errors.senha?.message}>
            <Input
              id="senha"
              type="password"
              autoComplete="new-password"
              {...form.register('senha')}
            />
            <RequisitosSenha />
          </Campo>
          <Campo id="papel" label="Papel" erro={errors.papel?.message}>
            <Controller
              control={form.control}
              name="papel"
              render={({ field }) => (
                <SelectPapel id="papel" value={field.value} onChange={field.onChange} />
              )}
            />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" />}
              Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogEditar({
  usuario,
  onFechar,
}: {
  usuario: UsuarioPublico | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const form = useForm<Edicao>({
    resolver: zodResolver(edicaoSchema),
    values: usuario ? { nome: usuario.nome, papel: usuario.papel } : undefined,
  });
  const m = useMutation({
    mutationFn: (d: Edicao) =>
      api<UsuarioPublico>(`/usuarios/${usuario!.id}`, { method: 'PATCH', json: d }),
    onSuccess: () => {
      toast.success('Usuário atualizado');
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar usuário'),
  });
  return (
    <Dialog open={!!usuario} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>{usuario?.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((d) => m.mutate(d))} className="grid gap-4" noValidate>
          <Campo id="edit-nome" label="Nome" erro={form.formState.errors.nome?.message}>
            <Input id="edit-nome" {...form.register('nome')} />
          </Campo>
          <Campo id="edit-papel" label="Papel">
            <Controller
              control={form.control}
              name="papel"
              render={({ field }) => (
                <SelectPapel id="edit-papel" value={field.value} onChange={field.onChange} />
              )}
            />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Usuarios() {
  const { usuario: eu } = useAuth();
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<UsuarioPublico | null>(null);
  const [linkPara, setLinkPara] = useState<UsuarioPublico | null>(null);
  const q = useQuery({ queryKey: ['usuarios'], queryFn: () => api<UsuarioPublico[]>('/usuarios') });
  const alternar = useMutation({
    mutationFn: (u: UsuarioPublico) =>
      api<UsuarioPublico>(`/usuarios/${u.id}`, { method: 'PATCH', json: { ativo: !u.ativo } }),
    onSuccess: (u) => {
      toast.success(u.ativo ? `${u.nome} reativado` : `${u.nome} desativado`);
      qc.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar usuário'),
  });

  return (
    <>
      <PageHeader
        titulo="Usuários"
        descricao="Gerencie quem acessa a plataforma e com qual papel."
        acoes={
          <Button onClick={() => setCriando(true)}>
            <Plus /> Novo usuário
          </Button>
        }
      />
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Último acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : (q.data ?? []).map((u) => (
                  <TableRow key={u.id} className={u.ativo ? undefined : 'opacity-60'}>
                    <TableCell className="font-medium">
                      {u.nome}
                      {u.id === eu?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                      )}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.papel === 'ADMIN' ? 'brand' : 'secondary'}>
                        {PAPEL_LABEL[u.papel]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.ativo ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="destructive">Desativado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {u.ultimoLoginEm ? data.format(new Date(u.ultimoLoginEm)) : 'Nunca'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditando(u)}
                          aria-label={`Editar ${u.nome}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!u.ativo}
                          onClick={() => setLinkPara(u)}
                          aria-label={`Gerar link de nova senha para ${u.nome}`}
                          title="Link para nova senha"
                        >
                          <KeyRound />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={u.id === eu?.id || alternar.isPending}
                          onClick={() => alternar.mutate(u)}
                          aria-label={u.ativo ? `Desativar ${u.nome}` : `Reativar ${u.nome}`}
                          title={u.ativo ? 'Desativar' : 'Reativar'}
                        >
                          {u.ativo ? <UserX /> : <UserCheck />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </Card>
      <div className="mt-6">
        <CodigoEquipeCard />
      </div>
      <DialogCriar aberto={criando} onFechar={() => setCriando(false)} />
      <DialogEditar usuario={editando} onFechar={() => setEditando(null)} />
      <LinkSenhaDialog usuario={linkPara} onFechar={() => setLinkPara(null)} />
    </>
  );
}

export default function UsuariosPage() {
  return (
    <SomentePapeis papeis={['ADMIN']}>
      <Usuarios />
    </SomentePapeis>
  );
}
