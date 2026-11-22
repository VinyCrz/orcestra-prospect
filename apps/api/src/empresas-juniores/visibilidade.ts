import type { Prisma } from '@prisma/client';

/**
 * Regra de visibilidade: o sistema só mostra EJs com alguma forma de contato (`temContato`, mantido por
 * triggers no banco). As demais ficam ocultas (nada é apagado). Aplicar em listas, exportação, opções de filtro,
 * ações em massa, carteira, kanban, alertas, inscrição em cadência e métricas de BASE do dashboard.
 * NÃO aplicar na deduplicação (importação, criação manual), no detalhe por id nem em métricas de atividade do SDR.
 */
export const EJ_VISIVEL = { temContato: true } satisfies Prisma.EmpresaJuniorWhereInput;
export const MOTIVO_EJ_OCULTA = 'EJ sem forma de contato';
