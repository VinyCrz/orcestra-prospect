'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { senhaSchema } from '@orcestra/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequisitosSenha } from '@/components/form/requisitos-senha';
import { Campo } from '@/components/form/campo';
import { api, ApiError } from '@/lib/api';

const schema = z
  .object({ senha: senhaSchema, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, {
    message: 'As senhas não conferem',
    path: ['confirmacao'],
  });

function Form() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  if (!token) {
    return (
      <div className="grid gap-4">
        <h1 className="text-xl font-semibold">Link inválido</h1>
        <p className="text-sm text-muted-foreground">Solicite um novo link de redefinição.</p>
        <Button asChild>
          <Link href="/esqueci-senha">Solicitar novo link</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = handleSubmit(async ({ senha }) => {
    try {
      await api('/auth/redefinir-senha', {
        method: 'POST',
        json: { token, senha },
        semRenovar: true,
      });
      toast.success('Senha redefinida. Faça login com a nova senha.');
      router.replace('/login');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Não foi possível redefinir a senha.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nova senha</h1>
        <p className="text-sm text-muted-foreground">
          Escolha uma senha forte.
        </p>
        <RequisitosSenha />
      </div>
      <Campo id="senha" label="Nova senha" erro={formState.errors.senha?.message}>
        <Input id="senha" type="password" autoComplete="new-password" {...register('senha')} />
      </Campo>
      <Campo id="confirmacao" label="Confirme a senha" erro={formState.errors.confirmacao?.message}>
        <Input
          id="confirmacao"
          type="password"
          autoComplete="new-password"
          {...register('confirmacao')}
        />
      </Campo>
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="animate-spin" />}
        Redefinir senha
      </Button>
    </form>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
