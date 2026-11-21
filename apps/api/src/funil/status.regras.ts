import { BadRequestException } from '@nestjs/common';
import type { StatusProspeccao } from '@prisma/client';

export interface EntradaStatus {
  status: StatusProspeccao;
  motivoPerdaId?: string | null;
  motivoPerdaDetalhe?: string | null;
  /** AAAA-MM-DD */
  dataRetornoNutricao?: string | null;
}

export interface CamposStatus {
  statusProspeccao: StatusProspeccao;
  motivoPerdaId: string | null;
  motivoPerdaDetalhe: string | null;
  dataRetornoNutricao: Date | null;
}

/**
 * Regras do funil (puras): PERDIDA exige motivo; NUTRICAO exige data de retorno; os campos de perda/nutrição
 * só existem no status correspondente (são limpos ao sair).
 */
export function camposDoStatus(e: EntradaStatus): CamposStatus {
  if (e.status === 'PERDIDA' && !e.motivoPerdaId)
    throw new BadRequestException('Informe o motivo da perda');
  if (e.status === 'NUTRICAO' && !e.dataRetornoNutricao)
    throw new BadRequestException('Informe a data de retorno da nutrição');
  return {
    statusProspeccao: e.status,
    motivoPerdaId: e.status === 'PERDIDA' ? (e.motivoPerdaId ?? null) : null,
    motivoPerdaDetalhe: e.status === 'PERDIDA' ? (e.motivoPerdaDetalhe || null) : null,
    dataRetornoNutricao:
      e.status === 'NUTRICAO' && e.dataRetornoNutricao
        ? new Date(`${e.dataRetornoNutricao}T00:00:00.000Z`)
        : null,
  };
}
