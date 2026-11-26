'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { cadastroSchema, type CadastroInput } from '@orcestra/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/form/campo';
import { RequisitosSenha } from '@/components/form/requisitos-senha';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';

export default function CadastroPage() {
  const { entrar, estado } = useAuth();
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<CadastroInput>({
    resolver: zodResolver(cadastroSchema),
  });

  useEffect(() => {
    if (estado === 'autenticado') router.replace('/empresas-juniores');
  }, [estado, router]);

  const onSubmit = handleSubmit(async (dados) => {
    setErro(null);
    try {
      await api('/auth/cadastro', { method: 'POST', json: dados, semRenovar: true });
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status === 429
          ? 'Muitas tentativas. Aguarde um minuto e tente novamente.'
          : e instanceof ApiError
            ? e.message
            : 'Não foi possível criar a conta. Tente novamente.',
      );
      return;
    }
    try {
      await entrar(dados.email, dados.senha);
      router.replace('/empresas-juniores');
    } catch {
      router.replace('/login');
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
        <p className="text-sm text-muted-foreground">
          Use o código da equipe que o administrador passou para você.
        </p>
      </div>
      {erro && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {erro}
        </div>
      )}
      <Campo id="nome" label="Nome" erro={formState.errors.nome?.message}>
        <Input
          id="nome"
          autoComplete="name"
          aria-invalid={!!formState.errors.nome}
          {...register('nome')}
        />
      </Campo>
      <Campo id="email" label="E-mail" erro={formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          aria-invalid={!!formState.errors.email}
          {...register('email')}
        />
      </Campo>
      <Campo id="senha" label="Senha" erro={formState.errors.senha?.message}>
        <Input
          id="senha"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!formState.errors.senha}
          aria-describedby="requisitos-senha"
          {...register('senha')}
        />
      </Campo>
      <RequisitosSenha />
      <Campo id="codigo" label="Código da equipe" erro={formState.errors.codigo?.message}>
        <Input
          id="codigo"
          autoComplete="off"
          aria-invalid={!!formState.errors.codigo}
          {...register('codigo')}
        />
      </Campo>
      <Button type="submit" disabled={formState.isSubmitting} className="w-full">
        {formState.isSubmitting && <Loader2 className="animate-spin" />}
        Criar conta
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
