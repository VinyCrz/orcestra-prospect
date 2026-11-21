'use client';
import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { FormularioEj } from '@/components/ej/ej-form';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import type { EmpresaJuniorDetalhe } from '@/lib/tipos';

export default function EditarEjPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ['ej', id],
    queryFn: () => api<EmpresaJuniorDetalhe>(`/empresas-juniores/${id}`),
  });
  const voltar = (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href={`/empresas-juniores/${id}`}>
        <ArrowLeft /> Voltar ao detalhe
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div className="mx-auto grid max-w-4xl gap-4">
        {voltar}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div>
        {voltar}
        <p className="text-destructive">
          {q.error instanceof ApiError && q.error.status === 404
            ? 'Empresa Júnior não encontrada.'
            : 'Erro ao carregar a Empresa Júnior.'}
        </p>
      </div>
    );
  }
  if (!q.data.podeEditar) {
    return (
      <div>
        {voltar}
        <p className="text-muted-foreground">
          Você só pode editar Empresas Juniores da sua carteira.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      {voltar}
      <PageHeader titulo={`Editar ${q.data.nome}`} />
      <FormularioEj ej={q.data} />
    </div>
  );
}
