'use client';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { UsuarioPublico } from '@orcestra/shared';
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
import { api, ApiError } from '@/lib/api';

type Resposta = { link: string; expiraEm: string };

/** Gera o link de redefinição de senha para o ADMIN enviar à pessoa (não há envio de e-mail). */
export function LinkSenhaDialog({
  usuario,
  onFechar,
}: {
  usuario: UsuarioPublico | null;
  onFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const m = useMutation({
    mutationFn: (id: string) =>
      api<Resposta>(`/usuarios/${id}/link-redefinicao`, { method: 'POST' }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao gerar o link'),
  });
  const { mutate, reset } = m;

  useEffect(() => {
    setCopiado(false);
    if (usuario) mutate(usuario.id);
    else reset();
  }, [usuario, mutate, reset]);

  const link = m.data?.link;
  const mensagem = link
    ? `Olá, ${usuario?.nome.split(' ')[0]}! Para criar sua nova senha no Orc'estra Prospect, use este link (vale por 24 h): ${link}`
    : '';

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  return (
    <Dialog open={!!usuario} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link para nova senha</DialogTitle>
          <DialogDescription>
            Envie para {usuario?.nome}. Vale por 24 horas, uma única vez; gerar outro invalida este.
          </DialogDescription>
        </DialogHeader>
        {m.isPending || !link ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            {m.isPending && <Loader2 className="size-4 animate-spin" />}
            {m.isPending ? 'Gerando link…' : 'Não foi possível gerar o link.'}
          </div>
        ) : (
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
            <Button type="button" variant="outline" size="icon" onClick={copiar} aria-label="Copiar link">
              {copiado ? <Check /> : <Copy />}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <Button asChild disabled={!link}>
            <a
              href={link ? `https://wa.me/?text=${encodeURIComponent(mensagem)}` : undefined}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle /> Enviar por WhatsApp
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
