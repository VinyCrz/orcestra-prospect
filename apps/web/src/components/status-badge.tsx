import { STATUS_PROSPECCAO_LABEL, type StatusProspeccao } from '@orcestra/shared';
import { Badge } from '@/components/ui/badge';

const VARIANTE: Partial<
  Record<StatusProspeccao, 'secondary' | 'brand' | 'success' | 'destructive'>
> = {
  NAO_TRABALHADA: 'secondary',
  GANHA: 'success',
  PERDIDA: 'destructive',
  DESCARTADA: 'destructive',
};

export function StatusBadge({ status }: { status: StatusProspeccao }) {
  return <Badge variant={VARIANTE[status] ?? 'brand'}>{STATUS_PROSPECCAO_LABEL[status]}</Badge>;
}
