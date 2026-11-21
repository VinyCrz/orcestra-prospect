import { BadRequestException } from '@nestjs/common';
import { inicioDoDiaSP, somarDias } from '../common/fuso';

export const MAX_DIAS_PERIODO = 366;

const soData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const paraInstante = (v: string) => (soData(v) ? new Date(`${v}T03:00:00.000Z`) : new Date(v));

/**
 * Período [ini, fim) em UTC. Datas puras são dias civis de SP; `fim` em data pura é inclusivo (vira o início do
 * dia seguinte). Padrão: últimos 30 dias incluindo hoje. Máx. 366 dias.
 */
export function resolverPeriodo(inicio: string | undefined, fim: string | undefined, agora = new Date()) {
  const hoje = inicioDoDiaSP(agora);
  const fimExcl = fim ? (soData(fim) ? somarDias(paraInstante(fim), 1) : paraInstante(fim)) : somarDias(hoje, 1);
  const ini = inicio ? paraInstante(inicio) : somarDias(fimExcl, -30);
  if (ini >= fimExcl) throw new BadRequestException('O início deve ser anterior ao fim do período');
  if ((fimExcl.getTime() - ini.getTime()) / 86_400_000 > MAX_DIAS_PERIODO)
    throw new BadRequestException(`Período máximo de ${MAX_DIAS_PERIODO} dias`);
  return { ini, fim: fimExcl };
}

/** SDR sempre vê só os próprios dados (ignora/rejeita responsavelId alheio); GESTOR/ADMIN: filtro opcional. */
export function escopoResponsavel(
  usuario: { id: string; papel: string },
  responsavelId?: string,
): string | null {
  if (usuario.papel === 'SDR') return usuario.id;
  return responsavelId ?? null;
}
