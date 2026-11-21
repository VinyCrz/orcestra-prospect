'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Bookmark, Loader2, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { listaSalvaSchema } from '@orcestra/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { contarFiltros, filtrosParaUrl, urlParaFiltros, type FiltrosUrl } from '@/lib/filtros-ej';
import type { ListaSalva } from '@/lib/tipos';

export function ListasSalvas({
  filtros,
  onAplicar,
}: {
  filtros: FiltrosUrl;
  onAplicar: (f: FiltrosUrl) => void;
}) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [compartilhada, setCompartilhada] = useState(false);
  const [erro, setErro] = useState<string>();

  const listas = useQuery({
    queryKey: ['listas-salvas'],
    queryFn: () => api<ListaSalva[]>('/listas-salvas'),
    enabled: aberto,
  });

  const salvar = useMutation({
    mutationFn: (json: unknown) => api<ListaSalva>('/listas-salvas', { method: 'POST', json }),
    onSuccess: () => {
      toast.success('Lista salva');
      setNome('');
      setCompartilhada(false);
      void qc.invalidateQueries({ queryKey: ['listas-salvas'] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao salvar a lista'),
  });
  const excluir = useMutation({
    mutationFn: (id: string) => api(`/listas-salvas/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Lista excluída');
      void qc.invalidateQueries({ queryKey: ['listas-salvas'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir'),
  });

  function aoSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(undefined);
    const r = listaSalvaSchema.safeParse({
      nome,
      compartilhada,
      filtros: urlParaFiltros(filtros),
    });
    if (!r.success) return setErro(r.error.issues[0]?.message ?? 'Dados inválidos');
    salvar.mutate(r.data);
  }

  const semFiltros = contarFiltros(filtros) === 0 && !filtros.busca;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="abrir-listas">
          <Bookmark /> Listas salvas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Listas salvas</DialogTitle>
          <DialogDescription>
            Guarde combinações de filtros, para você ou para o time.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={aoSalvar} className="grid gap-3 rounded-md border p-3" noValidate>
          <Label htmlFor="lista-nome">Salvar filtros atuais como</Label>
          <Input
            id="lista-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Federadas do Sul sem responsável"
            aria-invalid={!!erro}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="lista-compartilhada"
              checked={compartilhada}
              onChange={(e) => setCompartilhada(e.target.checked)}
            />
            <Label htmlFor="lista-compartilhada">Compartilhar com o time</Label>
          </div>
          {erro && (
            <p className="text-sm text-destructive" role="alert">
              {erro}
            </p>
          )}
          <Button type="submit" disabled={salvar.isPending || semFiltros}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <BookmarkPlus />}
            Salvar lista
          </Button>
          {semFiltros && (
            <p className="text-xs text-muted-foreground">Aplique ao menos um filtro para salvar.</p>
          )}
        </form>

        <div className="grid max-h-64 gap-2 overflow-y-auto">
          {listas.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : listas.isError ? (
            <p className="text-sm text-destructive">Não foi possível carregar as listas.</p>
          ) : (listas.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma lista salva ainda.</p>
          ) : (
            listas.data!.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.nome}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {l.compartilhada && (
                      <Badge variant="brand">
                        <Users /> Time
                      </Badge>
                    )}
                    {l.minha ? 'Sua lista' : `de ${l.dono.nome}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onAplicar(filtrosParaUrl(l.filtros));
                    setAberto(false);
                  }}
                >
                  Aplicar
                </Button>
                {l.minha && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Excluir lista ${l.nome}`}
                    disabled={excluir.isPending}
                    onClick={() => excluir.mutate(l.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
