import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Federacao, OpcaoIes, OpcaoTag, OpcoesResponsaveis } from '@/lib/tipos';

const STALE = 5 * 60_000;

export const useFiltrosBase = () =>
  useQuery({
    queryKey: ['ejs-filtros'],
    queryFn: () =>
      api<{ ufs: { uf: string; total: number }[]; regioes: { regiao: string; total: number }[] }>(
        '/empresas-juniores/filtros',
      ),
    staleTime: STALE,
  });
export const useFederacoes = () =>
  useQuery({ queryKey: ['federacoes'], queryFn: () => api<Federacao[]>('/federacoes'), staleTime: STALE });
export const useOpcoesIes = (habilitado = true) =>
  useQuery({
    queryKey: ['opcoes-ies'],
    queryFn: () => api<OpcaoIes[]>('/empresas-juniores/opcoes/ies'),
    staleTime: STALE,
    enabled: habilitado,
  });
export const useOpcoesTags = () =>
  useQuery({
    queryKey: ['opcoes-tags'],
    queryFn: () => api<OpcaoTag[]>('/empresas-juniores/opcoes/tags'),
    staleTime: STALE,
  });
export const useOpcoesResponsaveis = (habilitado = true) =>
  useQuery({
    queryKey: ['opcoes-responsaveis'],
    queryFn: () => api<OpcoesResponsaveis>('/empresas-juniores/opcoes/responsaveis'),
    staleTime: 60_000,
    enabled: habilitado,
  });
