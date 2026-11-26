'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import type { StatusProspeccao } from '@orcestra/shared';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidarEj } from './interacao-dialog';

const ANTES_DO_FUNIL: StatusProspeccao[] = ['NAO_TRABALHADA', 'PESQUISADA'];

/**
 * "Prospectar" num clique: a EJ vai para a sua carteira e entra no funil em "Primeiro contato".
 * Só aparece enquanto a EJ ainda não foi abordada e não está na carteira de outra pessoa (para SDR).
 */
export function BotaoProspectar({
  ej,
  compacto = false,
}: {
  ej: { id: string; nome: string; statusProspeccao: StatusProspeccao; responsavel: { id: string } | null };
  compacto?: boolean;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const { usuario, temPapel } = useAuth();
  const m = useMutation({
    mutationFn: () => api(`/empresas-juniores/${ej.id}/prospectar`, { method: 'POST' }),
    onSuccess: () => {
      invalidarEj(qc, ej.id);
      toast.success(`${ej.nome} está no seu funil, em “Primeiro contato”`, {
        action: { label: 'Ver funil', onClick: () => router.push('/funil') },
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível prospectar'),
  });

  const deOutraPessoa = !!ej.responsavel && ej.responsavel.id !== usuario?.id;
  if (!ANTES_DO_FUNIL.includes(ej.statusProspeccao)) return null;
  if (deOutraPessoa && !temPapel('ADMIN', 'GESTOR')) return null;

  return (
    <Button
      size="sm"
      variant={compacto ? 'outline' : 'default'}
      className={compacto ? 'h-7 px-2 text-xs' : undefined}
      disabled={m.isPending}
      onClick={() => m.mutate()}
      title="Coloca a EJ na sua carteira e no funil, em “Primeiro contato”"
      aria-label={`Prospectar ${ej.nome}`}
    >
      <Target /> {m.isPending ? 'Prospectando…' : 'Prospectar'}
    </Button>
  );
}
