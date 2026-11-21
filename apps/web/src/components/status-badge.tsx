import { STATUS_PROSPECCAO_LABEL, type StatusProspeccao } from '@orcestra/shared';
import { Badge } from '@/components/ui/badge';

const VARIANTE: Partial<
  Record<StatusProspeccao, 'secondary' | 'brand' | 'success' | 'destructive'>
> = {
  NAO_TRABALHADA: 'secondary',
  OPORTUNIDADE: 'success',
  PERDIDA: 'destructive',
  NUTRICAO: 'secondary',
};

export function StatusBadge({ status }: { status: StatusProspeccao }) {
  return <Badge variant={VARIANTE[status] ?? 'brand'}>{STATUS_PROSPECCAO_LABEL[status]}</Badge>;
}
