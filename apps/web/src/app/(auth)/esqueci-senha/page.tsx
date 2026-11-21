'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { esqueciSenhaSchema, type EsqueciSenhaInput } from '@orcestra/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/form/campo';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function EsqueciSenhaPage() {
  const [enviado, setEnviado] = useState(false);
  const { register, handleSubmit, formState } = useForm<EsqueciSenhaInput>({
    resolver: zodResolver(esqueciSenhaSchema),
  });

  const onSubmit = handleSubmit(async (dados) => {
    try {
      await api('/auth/esqueci-senha', { method: 'POST', json: dados, semRenovar: true });
      setEnviado(true);
    } catch {
      toast.error('Não foi possível enviar agora. Tente novamente.');
    }
  });

  if (enviado) {
    return (
      <div className="grid gap-4 text-center">
        <MailCheck className="mx-auto size-10 text-primary" />
        <h1 className="text-xl font-semibold">Verifique seu e-mail</h1>
        <p className="text-sm text-muted-foreground">
          Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha. (Nesta versão,
          o link aparece no log da API.)
        </p>
        <Button asChild variant="outline">
          <Link href="/login">Voltar ao login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="text-sm text-muted-foreground">
          Informe seu e-mail para receber um link de redefinição.
        </p>
      </div>
      <Campo id="email" label="E-mail" erro={formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!formState.errors.email}
          {...register('email')}
        />
      </Campo>
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="animate-spin" />}
        Enviar link
      </Button>
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar ao login
      </Link>
    </form>
  );
}
