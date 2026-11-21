'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { loginSchema, type LoginInput } from '@orcestra/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/form/campo';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

function destinoSeguro(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/empresas-juniores';
}

function FormLogin() {
  const { entrar, estado } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (estado === 'autenticado') router.replace(destinoSeguro(params.get('next')));
  }, [estado, params, router]);

  const onSubmit = handleSubmit(async (dados) => {
    setErro(null);
    try {
      await entrar(dados.email, dados.senha);
      router.replace(destinoSeguro(params.get('next')));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível entrar. Tente novamente.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">Acesse com seu e-mail corporativo.</p>
      </div>
      {erro && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {erro}
        </div>
      )}
      <Campo id="email" label="E-mail" erro={formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="voce@orcestra.com.br"
          aria-invalid={!!formState.errors.email}
          {...register('email')}
        />
      </Campo>
      <Campo
        id="senha"
        label="Senha"
        erro={formState.errors.senha?.message}
        extra={
          <Link
            href="/esqueci-senha"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Esqueci minha senha
          </Link>
        }
      >
        <Input
          id="senha"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!formState.errors.senha}
          {...register('senha')}
        />
      </Campo>
      <Button type="submit" disabled={formState.isSubmitting} className="w-full">
        {formState.isSubmitting && <Loader2 className="animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <FormLogin />
    </Suspense>
  );
}
