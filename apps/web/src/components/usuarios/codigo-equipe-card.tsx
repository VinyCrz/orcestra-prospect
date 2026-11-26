'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { codigoCadastroSchema } from '@orcestra/shared';
import { Campo } from '@/components/form/campo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

type Status = { definido: boolean; alteradoEm: string | null };
const formSchema = z.object({ codigo: codigoCadastroSchema.shape.codigo.unwrap() });
type Form = z.infer<typeof formSchema>;
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** ADMIN define o código que libera o autocadastro (tela /cadastro). Sem código, o cadastro fica fechado. */
export function CodigoEquipeCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['codigo-cadastro'],
    queryFn: () => api<Status>('/usuarios/codigo-cadastro'),
  });
  const form = useForm<Form>({ resolver: zodResolver(formSchema), defaultValues: { codigo: '' } });
  const m = useMutation({
    mutationFn: (codigo: string | null) =>
      api<Status>('/usuarios/codigo-cadastro', { method: 'PUT', json: { codigo } }),
    onSuccess: (s) => {
      qc.setQueryData(['codigo-cadastro'], s);
      toast.success(s.definido ? 'Código salvo. O cadastro está aberto.' : 'Cadastro fechado.');
      form.reset({ codigo: '' });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar o código'),
  });
  const definido = q.data?.definido ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Código da equipe
          {q.data && (
            <Badge variant={definido ? 'success' : 'secondary'}>
              {definido ? 'Cadastro aberto' : 'Cadastro fechado'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Quem tiver este código cria a própria conta em <strong>/cadastro</strong>, como SDR.
          Depois você pode mudar o papel ou desativar a conta aqui. O código fica guardado
          cifrado: anote-o antes de salvar.
          {q.data?.alteradoEm && ` Última alteração: ${data.format(new Date(q.data.alteradoEm))}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((d) => m.mutate(d.codigo))}
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          noValidate
        >
          <div className="sm:w-80">
            <Campo
              id="codigo-equipe"
              label={definido ? 'Novo código' : 'Código'}
              erro={form.formState.errors.codigo?.message}
            >
              <Input
                id="codigo-equipe"
                autoComplete="off"
                placeholder="mínimo 8 caracteres, sem espaços"
                {...form.register('codigo')}
              />
            </Campo>
          </div>
          <div className="flex gap-2 sm:pt-6">
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" />}
              {definido ? 'Trocar código' : 'Abrir cadastro'}
            </Button>
            {definido && (
              <Button
                type="button"
                variant="outline"
                disabled={m.isPending}
                onClick={() => m.mutate(null)}
              >
                <Lock /> Fechar cadastro
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
