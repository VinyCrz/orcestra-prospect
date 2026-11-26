import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Sem envio de e-mail: quem esqueceu a senha recebe um link gerado pelo administrador. */
export default function EsqueciSenhaPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Esqueceu a senha?</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Peça a um administrador da equipe. Em <strong>Usuários</strong>, ele gera um link para
          você criar uma senha nova e envia por WhatsApp ou e-mail. O link vale por 24 horas e só
          pode ser usado uma vez.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/login">
          <ArrowLeft /> Voltar ao login
        </Link>
      </Button>
    </div>
  );
}
