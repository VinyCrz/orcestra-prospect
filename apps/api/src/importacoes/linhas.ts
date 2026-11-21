import {
  BASES_LEGAIS,
  chaveDedupe,
  chaveNome,
  limparEspacos,
  normalizarCidade,
  normalizarCnpj,
  normalizarEmail,
  normalizarInstagram,
  normalizarNomeIes,
  normalizarTelefone,
  normalizarUf,
  normalizarUrl,
  regiaoDaUf,
  type BaseLegal,
  type CargoContato,
} from '@orcestra/shared';

export interface ErroLinha {
  campo?: string;
  mensagem: string;
}

// ---------------------------------------------------------------------------------------------
// Conversores
// ---------------------------------------------------------------------------------------------

export function parseBool(v: string): boolean | null {
  const k = chaveNome(v);
  if (['sim', 's', 'true', '1', 'yes', 'y', 'x', 'verdadeiro'].includes(k)) return true;
  if (['nao', 'n', 'false', '0', 'no', 'falso'].includes(k)) return false;
  return null;
}

export function parseLista(v: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const p of v.split(/[;,|\n]/).map(limparEspacos)) {
    const k = chaveNome(p);
    if (p && !vistos.has(k)) {
      vistos.add(k);
      out.push(p);
    }
  }
  return out;
}

/** dd/mm/aaaa, aaaa-mm-dd (ou com hora) -> aaaa-mm-dd. */
export function parseData(v: string): string | null {
  const s = v.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseCargo(v: string): { cargo: CargoContato; cargoDescricao: string | null } {
  const k = chaveNome(v);
  if (!k) return { cargo: 'OUTRO', cargoDescricao: null };
  if (/president/.test(k)) return { cargo: 'PRESIDENTE', cargoDescricao: null };
  if (/\bgente\b|pessoas|\brh\b|people|recursos humanos/.test(k))
    return { cargo: 'DIR_GENTE_GESTAO', cargoDescricao: null };
  if (/comercial|vendas|\bnegocios\b/.test(k)) return { cargo: 'DIR_COMERCIAL', cargoDescricao: null };
  if (/projetos|operacoes/.test(k)) return { cargo: 'DIR_PROJETOS', cargoDescricao: null };
  return { cargo: 'OUTRO', cargoDescricao: limparEspacos(v) };
}

// ---------------------------------------------------------------------------------------------
// Linha de EJ
// ---------------------------------------------------------------------------------------------

export interface EjLinha {
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  ies: string | null;
  uf: string | null;
  cidade: string | null;
  federacao: string | null;
  tags: string[];
  servicos: string[];
  anoFundacao: number | null;
  membrosEstimados: number | null;
  federada: boolean | null;
  site: string | null;
  instagram: string | null;
  linkedin: string | null;
  facebook: string | null;
  emailInstitucional: string | null;
  telefoneInstitucional: string | null;
  observacoes: string | null;
}

const vazio = (v: string | undefined) => (v ?? '').trim() === '';

/** @param raw valores já indexados por CAMPO DO SISTEMA (via mapeamento) */
export function normalizarLinhaEj(raw: Record<string, string>): {
  dados?: EjLinha;
  erros: ErroLinha[];
} {
  const erros: ErroLinha[] = [];
  const get = (c: string) => (raw[c] ?? '').trim();
  const conv = <T>(campo: string, rotulo: string, fn: (v: string) => T | null): T | null => {
    if (vazio(raw[campo])) return null;
    const r = fn(get(campo));
    if (r === null) erros.push({ campo, mensagem: `${rotulo} inválido: "${get(campo)}"` });
    return r;
  };

  const nome = limparEspacos(get('nome'));
  if (nome.length < 2) erros.push({ campo: 'nome', mensagem: 'Nome obrigatório' });
  const ano = conv('anoFundacao', 'Ano de fundação', (v) => {
    const n = /^\d{4}$/.test(v) ? Number(v) : NaN;
    return n >= 1900 && n <= 2100 ? n : null;
  });
  const membros = conv('membrosEstimados', 'Nº de membros', (v) =>
    /^\d{1,6}$/.test(v) ? Number(v) : null,
  );
  const dados: EjLinha = {
    nome,
    razaoSocial: get('razaoSocial') || null,
    cnpj: conv('cnpj', 'CNPJ', normalizarCnpj),
    ies: vazio(raw.ies) ? null : (normalizarNomeIes(get('ies')) ?? get('ies')),
    uf: conv('uf', 'UF', normalizarUf),
    cidade: vazio(raw.cidade) ? null : normalizarCidade(get('cidade')),
    federacao: get('federacao') || null,
    tags: vazio(raw.tags) ? [] : parseLista(get('tags')),
    servicos: vazio(raw.servicos) ? [] : parseLista(get('servicos')),
    anoFundacao: ano,
    membrosEstimados: membros,
    federada: conv('federada', 'Federada', parseBool),
    site: conv('site', 'Site', normalizarUrl),
    instagram: conv('instagram', 'Instagram', normalizarInstagram),
    linkedin: conv('linkedin', 'LinkedIn', normalizarUrl),
    facebook: conv('facebook', 'Facebook', normalizarUrl),
    emailInstitucional: conv('emailInstitucional', 'E-mail', normalizarEmail),
    telefoneInstitucional: conv('telefoneInstitucional', 'Telefone', normalizarTelefone),
    observacoes: get('observacoes') || null,
  };
  return erros.length ? { erros } : { dados, erros };
}

// ---------------------------------------------------------------------------------------------
// Índice de EJs existentes (deduplicação)
// ---------------------------------------------------------------------------------------------

export interface RefEj {
  id: string;
  cnpj: string | null;
  nomeNormalizado: string;
  uf: string | null;
  iesNome: string | null;
  chaveDedupe: string;
}

/** Índice em memória: casa por CNPJ; por chave (nome+IES+UF); ou por nome+UF com IES compatível. */
export class IndiceEjs {
  private porCnpj = new Map<string, RefEj>();
  private porChave = new Map<string, RefEj>();
  private porNomeUf = new Map<string, RefEj[]>();
  private porNome = new Map<string, RefEj[]>();

  constructor(refs: RefEj[] = []) {
    refs.forEach((r) => this.adicionar(r));
  }

  adicionar(r: RefEj) {
    if (r.cnpj) this.porCnpj.set(r.cnpj, r);
    this.porChave.set(r.chaveDedupe, r);
    const k = `${r.nomeNormalizado}|${r.uf ?? ''}`;
    (this.porNomeUf.get(k) ?? this.porNomeUf.set(k, []).get(k)!).push(r);
    (this.porNome.get(r.nomeNormalizado) ?? this.porNome.set(r.nomeNormalizado, []).get(r.nomeNormalizado)!).push(r);
  }

  porCnpjDe(cnpj: string) {
    return this.porCnpj.get(cnpj) ?? null;
  }
  porChaveDe(chave: string) {
    return this.porChave.get(chave) ?? null;
  }

  /** EJ já existente equivalente à linha (ou null). */
  buscar(d: Pick<EjLinha, 'cnpj' | 'nome' | 'ies' | 'uf'>): RefEj | null {
    if (d.cnpj) {
      const r = this.porCnpj.get(d.cnpj);
      if (r) return r;
    }
    const direta = this.porChave.get(chaveDedupe(d));
    if (direta && (!d.cnpj || !direta.cnpj || direta.cnpj === d.cnpj)) return direta;
    if (!d.uf) return null;
    const nomeNorm = chaveNome(d.nome);
    for (const c of this.porNomeUf.get(`${nomeNorm}|${d.uf}`) ?? []) {
      if (d.cnpj && c.cnpj && c.cnpj !== d.cnpj) continue; // CNPJs diferentes = empresas diferentes
      if (d.ies && c.iesNome && chaveNome(d.ies) !== chaveNome(c.iesNome)) continue;
      return c;
    }
    return null;
  }

  /** Candidatas para vincular um contato à EJ por nome (e UF, se informada). */
  buscarPorNome(nome: string, uf: string | null): RefEj[] {
    const n = chaveNome(nome);
    return uf ? (this.porNomeUf.get(`${n}|${uf}`) ?? []) : (this.porNome.get(n) ?? []);
  }
}

export function refDeLinha(id: string, d: EjLinha): RefEj {
  return {
    id,
    cnpj: d.cnpj,
    nomeNormalizado: chaveNome(d.nome),
    uf: d.uf,
    iesNome: d.ies,
    chaveDedupe: chaveDedupe(d),
  };
}

// ---------------------------------------------------------------------------------------------
// Mesclagem (MESCLAR): preenche só o que está vazio — nunca sobrescreve
// ---------------------------------------------------------------------------------------------

export interface EjExistente {
  razaoSocial: string | null;
  cnpj: string | null;
  iesId: string | null;
  federacaoId: string | null;
  cidade: string | null;
  uf: string | null;
  regiao: string | null;
  servicos: string[];
  anoFundacao: number | null;
  membrosEstimados: number | null;
  site: string | null;
  instagram: string | null;
  linkedin: string | null;
  facebook: string | null;
  emailInstitucional: string | null;
  telefoneInstitucional: string | null;
  observacoes: string | null;
}

const estaVazio = (v: unknown) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Retorna só os campos a atualizar. `iesId`/`federacaoId` resolvidos vêm em `resolvidos`.
 * Status, responsável, score, verificado e `federada` (default false = "não confirmado") nunca são tocados.
 */
export function calcularMerge(
  existente: EjExistente,
  novo: EjLinha,
  resolvidos: { iesId?: string | null; federacaoId?: string | null } = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const preencher = (campo: keyof EjExistente, valor: unknown) => {
    if (!estaVazio(valor) && estaVazio(existente[campo])) patch[campo] = valor;
  };
  preencher('razaoSocial', novo.razaoSocial);
  preencher('cnpj', novo.cnpj);
  preencher('iesId', resolvidos.iesId);
  preencher('federacaoId', resolvidos.federacaoId);
  preencher('cidade', novo.cidade);
  preencher('uf', novo.uf);
  preencher('anoFundacao', novo.anoFundacao);
  preencher('membrosEstimados', novo.membrosEstimados);
  preencher('site', novo.site);
  preencher('instagram', novo.instagram);
  preencher('linkedin', novo.linkedin);
  preencher('facebook', novo.facebook);
  preencher('emailInstitucional', novo.emailInstitucional);
  preencher('telefoneInstitucional', novo.telefoneInstitucional);
  preencher('observacoes', novo.observacoes);
  if (patch.uf && estaVazio(existente.regiao)) patch.regiao = regiaoDaUf(patch.uf as string);
  // serviços: união (mantém os existentes)
  const jaTem = new Set(existente.servicos.map(chaveNome));
  const extras = novo.servicos.filter((s) => !jaTem.has(chaveNome(s)));
  if (extras.length) patch.servicos = [...existente.servicos, ...extras];
  return patch;
}

// ---------------------------------------------------------------------------------------------
// Linha de contato
// ---------------------------------------------------------------------------------------------

export interface ContatoLinha {
  nome: string;
  ejCnpj: string | null;
  ejNome: string | null;
  ejUf: string | null;
  cargo: CargoContato;
  cargoDescricao: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  mandatoInicio: string | null;
  mandatoFim: string | null;
  fonte: string | null;
  baseLegal: BaseLegal;
}

/** Base legal da planilha (aceita o código ou o rótulo); vazio = legítimo interesse B2B. */
export function parseBaseLegal(v: string): BaseLegal | null {
  const k = chaveNome(v).replace(/\s+/g, '_').toUpperCase();
  if (!k) return 'LEGITIMO_INTERESSE_B2B';
  const direto = BASES_LEGAIS.find((b) => b === k);
  if (direto) return direto;
  if (/LEGITIMO/.test(k)) return 'LEGITIMO_INTERESSE_B2B';
  if (/CONSENTIMENTO/.test(k)) return 'CONSENTIMENTO';
  if (/CONTRATO/.test(k)) return 'EXECUCAO_CONTRATO';
  if (/OBRIGACAO/.test(k)) return 'OBRIGACAO_LEGAL';
  return null;
}

export function normalizarLinhaContato(raw: Record<string, string>): {
  dados?: ContatoLinha;
  erros: ErroLinha[];
} {
  const erros: ErroLinha[] = [];
  const get = (c: string) => (raw[c] ?? '').trim();
  const conv = <T>(campo: string, rotulo: string, fn: (v: string) => T | null): T | null => {
    if (vazio(raw[campo])) return null;
    const r = fn(get(campo));
    if (r === null) erros.push({ campo, mensagem: `${rotulo} inválido: "${get(campo)}"` });
    return r;
  };
  const nome = limparEspacos(get('nome'));
  if (nome.length < 2) erros.push({ campo: 'nome', mensagem: 'Nome do contato obrigatório' });
  const ejCnpj = conv('ejCnpj', 'CNPJ da EJ', normalizarCnpj);
  const ejUf = conv('ejUf', 'UF da EJ', normalizarUf);
  const ejNome = limparEspacos(get('ejNome')) || null;
  if (!ejCnpj && !ejNome && !erros.some((e) => e.campo === 'ejCnpj'))
    erros.push({ campo: 'ejNome', mensagem: 'Informe o CNPJ ou o nome da EJ' });
  const { cargo, cargoDescricao } = parseCargo(get('cargo'));
  const inicio = conv('mandatoInicio', 'Início do mandato', parseData);
  const fim = conv('mandatoFim', 'Fim do mandato', parseData);
  if (inicio && fim && fim < inicio)
    erros.push({ campo: 'mandatoFim', mensagem: 'Fim do mandato anterior ao início' });
  const baseLegal = parseBaseLegal(get('baseLegal'));
  if (!baseLegal) erros.push({ campo: 'baseLegal', mensagem: 'Base legal inválida' });
  const dados: ContatoLinha = {
    nome,
    ejCnpj,
    ejNome,
    ejUf,
    cargo,
    cargoDescricao,
    email: conv('email', 'E-mail', normalizarEmail),
    telefone: conv('telefone', 'Telefone', normalizarTelefone),
    whatsapp: conv('whatsapp', 'WhatsApp', normalizarTelefone),
    linkedin: conv('linkedin', 'LinkedIn', normalizarUrl),
    mandatoInicio: inicio,
    mandatoFim: fim,
    fonte: get('fonte') || null,
    baseLegal: baseLegal ?? 'LEGITIMO_INTERESSE_B2B',
  };
  return erros.length ? { erros } : { dados, erros };
}

export interface ContatoExistente {
  cargo: string;
  cargoDescricao: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  mandatoInicio: Date | null;
  mandatoFim: Date | null;
  fonte: string | null;
}

/** MESCLAR para contatos: só campos vazios; nunca mexe em opt-out, base legal ou principal. */
export function calcularMergeContato(
  existente: ContatoExistente,
  novo: ContatoLinha,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (existente.cargo === 'OUTRO' && novo.cargo !== 'OUTRO') patch.cargo = novo.cargo;
  for (const k of ['cargoDescricao', 'email', 'telefone', 'whatsapp', 'linkedin', 'fonte'] as const) {
    if (estaVazio(existente[k]) && !estaVazio(novo[k])) patch[k] = novo[k];
  }
  for (const k of ['mandatoInicio', 'mandatoFim'] as const) {
    if (!existente[k] && novo[k]) patch[k] = new Date(`${novo[k]}T00:00:00.000Z`);
  }
  return patch;
}

/** Chave de duplicidade de contato dentro da mesma EJ: e-mail, senão nome normalizado. */
export function chaveContato(c: { email: string | null; nome: string }): string {
  return c.email ? `email:${c.email.toLowerCase()}` : `nome:${chaveNome(c.nome)}`;
}
