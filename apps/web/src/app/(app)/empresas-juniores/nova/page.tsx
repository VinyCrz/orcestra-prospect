'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FormularioEj } from '@/components/ej/ej-form';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function NovaEjPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/empresas-juniores">
          <ArrowLeft /> Empresas Juniores
        </Link>
      </Button>
      <PageHeader
        titulo="Nova Empresa Júnior"
        descricao="Cadastro manual. Campos sem fonte confirmada podem ficar em branco."
      />
      <FormularioEj />
    </div>
  );
}
