import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MotivoPerda } from '@/lib/tipos-funil';

export const useMotivosPerda = (incluirInativos = false, habilitado = true) =>
  useQuery({
    queryKey: ['motivos-perda', incluirInativos],
    queryFn: () =>
      api<MotivoPerda[]>(`/motivos-perda${incluirInativos ? '?incluirInativos=true' : ''}`),
    staleTime: 60_000,
    enabled: habilitado,
  });
