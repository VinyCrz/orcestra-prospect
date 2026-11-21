'use client';
import { Kanban } from '@/components/funil/kanban';
import { PageHeader } from '@/components/page-header';

export default function FunilPage() {
  return (
    <div className="min-w-0">
      <PageHeader
        titulo="Funil"
        descricao="Arraste as Empresas Juniores entre as colunas ou use o menu “Mover para…” do card."
      />
      <Kanban />
    </div>
  );
}
