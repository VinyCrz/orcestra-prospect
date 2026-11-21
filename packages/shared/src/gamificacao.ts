/** Etapa 6 — dashboard e gamificação (schemas compartilhados API + front). */
import { z } from 'zod';

const idStr = z.string().trim().min(1).max(64);
const dataOuHora = z
  .string()
  .trim()
  .refine((v) => /^\d{4}-\d{2}-\d{2}(T.+)?$/.test(v) && !Number.isNaN(Date.parse(v)), 'Data inválida (use AAAA-MM-DD ou ISO)');

/** Período do dashboard. Data pura: início do dia SP; `fim` em data pura é inclusivo. Padrão: últimos 30 dias. Máx. 366 dias. */
export const dashboardQuerySchema = z.object({
  inicio: dataOuHora.optional(),
  fim: dataOuHora.optional(),
  responsavelId: idStr.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const SEMANA_REGEX = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const semana = z.string().trim().regex(SEMANA_REGEX, 'Use o formato AAAA-Www (ex.: 2026-W47)');

export const semanaQuerySchema = z.object({
  semana: semana.optional(),
  responsavelId: idStr.optional(),
});
export type SemanaQuery = z.infer<typeof semanaQuerySchema>;

export const avaliarSemanaQuerySchema = z.object({ semana: semana.optional() });
export type AvaliarSemanaQuery = z.infer<typeof avaliarSemanaQuerySchema>;

export const conquistasQuerySchema = z.object({ usuarioId: idStr.optional() });
export type ConquistasQuery = z.infer<typeof conquistasQuerySchema>;

export const metaInputSchema = z.object({
  interacoesSemana: z.number().int().min(0).max(10000),
  reunioesSemana: z.number().int().min(0).max(1000),
  /** segunda-feira (AAAA-MM-DD) da primeira semana em que vale; padrão: segunda da semana atual */
  vigenteDesde: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD')
    .optional(),
});
export type MetaInput = z.infer<typeof metaInputSchema>;

/** Pontos do ranking semanal: 1 por interação + 5 por reunião marcada (reunião também é interação). */
export const PONTOS_POR_INTERACAO = 1;
export const PONTOS_POR_REUNIAO = 5;
export const calcularPontos = (interacoes: number, reunioes: number) =>
  interacoes * PONTOS_POR_INTERACAO + reunioes * PONTOS_POR_REUNIAO;
