import { UFS } from './uf';
import type { Regiao } from './enums';
import type { EjColetada } from './types';

const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o']);

export function removerAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function limparEspacos(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Chave de comparação: minúsculas, sem acento, sem pontuação, "júnior"/"junior" → "jr". */
export function chaveNome(s: string | null | undefined): string {
  if (!s) return '';
  return limparEspacos(
    removerAcentos(s)
      .toLowerCase()
      .replace(/&/g, ' e ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\b(junior|jr)\b/g, 'jr'),
  );
}

export function normalizarUf(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = limparEspacos(input);
  const sigla = v.toUpperCase();
  if (UFS.some((u) => u.sigla === sigla)) return sigla;
  const k = chaveNome(v);
  const porNome = UFS.find((u) => chaveNome(u.nome) === k);
  return porNome ? porNome.sigla : null;
}

export function regiaoDaUf(uf: string | null | undefined): Regiao | null {
  const s = normalizarUf(uf);
  return s ? (UFS.find((u) => u.sigla === s)?.regiao ?? null) : null;
}

/** Title Case em pt-BR, mantendo preposições minúsculas e siglas (até 5 letras, sem vogais ou já em caixa alta entre parênteses). */
export function titleCasePtBr(s: string | null | undefined, siglas: string[] = []): string | null {
  if (!s) return null;
  const limpo = limparEspacos(s);
  if (!limpo) return null;
  const siglaSet = new Set(siglas.map((x) => x.toUpperCase()));
  return limpo
    .split(' ')
    .map((palavra, i) => {
      const bare = palavra.replace(/[()]/g, '');
      if (siglaSet.has(bare.toUpperCase())) return palavra.toUpperCase();
      const lower = palavra.toLocaleLowerCase('pt-BR');
      if (i > 0 && PREPOSICOES.has(lower)) return lower;
      // Siglas sem vogal (ex.: FCT, UFRGS já tratadas acima) ficam em caixa alta.
      if (/^[A-Z]{2,6}$/.test(bare) && !/[AEIOU]/.test(bare)) return palavra.toUpperCase();
      return lower
        .split('-')
        .map((p) => (p ? p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1) : p))
        .join('-');
    })
    .join(' ');
}

export function normalizarCidade(s: string | null | undefined): string | null {
  return titleCasePtBr(s);
}

const SIGLAS_IES_COMUNS = [
  'UFRJ',
  'UFF',
  'USP',
  'UNESP',
  'UNICAMP',
  'PUC',
  'UFSM',
  'UFRGS',
  'IFSul',
  'SENAI',
  'SENAC',
  'FGV',
  'IBMEC',
  'ESPM',
  'CEFET',
  'UERJ',
  'UNB',
  'IME',
];

/**
 * Grafia com acento de palavras frequentes em nomes de IES. A Receita Federal registra razões sociais
 * sem acentos ("UNIVERSIDADE FEDERAL DO PARA"); restauramos apenas palavras cuja grafia é inequívoca.
 */
const ACENTOS_IES: Record<string, string> = {
  amazonia: 'Amazônia',
  sao: 'São',
  joao: 'João',
  jose: 'José',
  parana: 'Paraná',
  goias: 'Goiás',
  ceara: 'Ceará',
  maranhao: 'Maranhão',
  piaui: 'Piauí',
  amapa: 'Amapá',
  espirito: 'Espírito',
  rondonia: 'Rondônia',
  paraiba: 'Paraíba',
  brasilia: 'Brasília',
  uberlandia: 'Uberlândia',
  maringa: 'Maringá',
  itajuba: 'Itajubá',
  vicosa: 'Viçosa',
  tecnologica: 'Tecnológica',
  tecnologico: 'Tecnológico',
  tecnologia: 'Tecnologia',
  ciencias: 'Ciências',
  ciencia: 'Ciência',
  educacao: 'Educação',
  computacao: 'Computação',
  administracao: 'Administração',
  comunicacao: 'Comunicação',
  fundacao: 'Fundação',
  associacao: 'Associação',
  integracao: 'Integração',
  saude: 'Saúde',
  tecnica: 'Técnica',
  politecnica: 'Politécnica',
  catolica: 'Católica',
  pontificia: 'Pontifícia',
  juridicas: 'Jurídicas',
  economicas: 'Econômicas',
  economia: 'Economia',
  agronomia: 'Agronomia',
  triangulo: 'Triângulo',
  arido: 'Árido',
  semi: 'Semi',
  centro: 'Centro',
  oeste: 'Oeste',
  medio: 'Médio',
  universitario: 'Universitário',
  universitaria: 'Universitária',
  academia: 'Academia',
  farmacia: 'Farmácia',
  odontologia: 'Odontologia',
  ribeirao: 'Ribeirão',
  petropolis: 'Petrópolis',
  niteroi: 'Niterói',
  vitoria: 'Vitória',
  belem: 'Belém',
  macae: 'Macaé',
  florianopolis: 'Florianópolis',
  sorocaba: 'Sorocaba',
  taubate: 'Taubaté',
  jau: 'Jaú',
  bage: 'Bagé',
  chapeco: 'Chapecó',
  criciuma: 'Criciúma',
  erechim: 'Erechim',
  ilheus: 'Ilhéus',
  feira: 'Feira',
  mossoro: 'Mossoró',
  cuiaba: 'Cuiabá',
  macapa: 'Macapá',
  roraima: 'Roraima',
  acre: 'Acre',
  alagoas: 'Alagoas',
  sergipe: 'Sergipe',
  ensino: 'Ensino',
  pesquisa: 'Pesquisa',
  engenharia: 'Engenharia',
  lavras: 'Lavras',
  mucuri: 'Mucuri',
  jequitinhonha: 'Jequitinhonha',
  ouro: 'Ouro',
  estadual: 'Estadual',
  municipal: 'Municipal',
  regiao: 'Região',
  regional: 'Regional',
  nacional: 'Nacional',
  sudoeste: 'Sudoeste',
  tocantins: 'Tocantins',
  latino: 'Latino',
  americana: 'Americana',
  fronteira: 'Fronteira',
  pampa: 'Pampa',
  grande: 'Grande',
  catarinense: 'Catarinense',
  mineiro: 'Mineiro',
  fluminense: 'Fluminense',
  baiano: 'Baiano',
  goiano: 'Goiano',
  potiguar: 'Potiguar',
  paulista: 'Paulista',
  gaucho: 'Gaúcho',
  barao: 'Barão',
  maua: 'Mauá',
  agrarias: 'Agrárias',
  mecanica: 'Mecânica',
  gestao: 'Gestão',
  negocios: 'Negócios',
  informacao: 'Informação',
  politica: 'Política',
  reconcavo: 'Recôncavo',
  coracao: 'Coração',
  sertao: 'Sertão',
  julio: 'Júlio',
  urutai: 'Urutaí',
  santarem: 'Santarém',
  paranaiba: 'Paranaíba',
  eletrica: 'Elétrica',
  quimica: 'Química',
  biologicas: 'Biológicas',
  humanas: 'Humanas',
  exatas: 'Exatas',
  agricolas: 'Agrícolas',
  veterinaria: 'Veterinária',
};

function restaurarAcentos(nome: string): string {
  const palavras = nome.split(' ');
  return palavras
    .map((p, i) => {
      const k = removerAcentos(p).toLowerCase();
      // "Para" só é o estado quando vem após "do" (Universidade Federal do Pará).
      if (k === 'para') return i > 0 && palavras[i - 1].toLowerCase() === 'do' ? 'Pará' : p;
      if (p.includes('-')) {
        return p
          .split('-')
          .map((q) => ACENTOS_IES[removerAcentos(q).toLowerCase()] ?? q)
          .join('-');
      }
      const [, base, pont] = /^(.*?)([.,;:]*)$/.exec(p)!;
      const kb = removerAcentos(base).toLowerCase();
      const acentuada = ACENTOS_IES[kb];
      return acentuada && base.toLowerCase() === kb ? acentuada + pont : p;
    })
    .join(' ');
}

/** Normaliza o nome de uma IES: Title Case, acentos de palavras frequentes, sem sufixos de campus. */
export function normalizarNomeIes(s: string | null | undefined): string | null {
  if (!s) return null;
  let v = limparEspacos(s)
    .replace(/[()]/g, ' ')
    .replace(/\s*[-–]?\s*\b(do\s+|de\s+)?(campus|unidade)\b.*$/i, '');
  v = limparEspacos(v).replace(/[.;,\s-]+$/, '');
  if (/^[A-Z0-9-]{2,15}$/.test(v)) return v; // sigla isolada (ex.: UFRRJ)
  // Sigla grudada por hífen no fim ("... do Para-Ifpa").
  const hifen = /-([A-Za-z]{2,12})$/.exec(v);
  if (hifen && extrairSiglaIes(hifen[1]) === hifen[1].toUpperCase())
    v = v.slice(0, -hifen[0].length);
  // Sigla repetida no fim do nome completo ("... do Oeste do Pará Ufopa", "... Pampa - Unipampa").
  const partes = v.split(/\s+[-–]\s+|\s+/);
  const penultima = (partes[partes.length - 2] ?? '').toLowerCase();
  if (
    partes.length > 3 &&
    !PREPOSICOES.has(penultima) &&
    extrairSiglaIes(partes[partes.length - 1]) ===
      removerAcentos(partes[partes.length - 1]).toUpperCase()
  ) {
    v = v.replace(/\s*[-–]?\s*[^\s-]+$/, '');
  }
  const t = titleCasePtBr(v, SIGLAS_IES_COMUNS);
  if (!t) return t;
  // Siglas de IES dentro do nome ("da Ufu" → "da UFU").
  const comSiglas = t
    .split(' ')
    .map((w) => {
      const sigla = extrairSiglaIes(w);
      return sigla && sigla === removerAcentos(w).toUpperCase() ? sigla : w;
    })
    .join(' ');
  return restaurarAcentos(comSiglas);
}

const RE_IES =
  /\b((?:PONTIFICIA\s+)?UNIVERSIDADE|FACULDADES?|CENTRO\s+UNIVERSITARIO|CENTRO\s+FEDERAL\s+DE\s+EDUCACAO|INSTITUTO\s+FEDERAL|INSTITUTO\s+TECNOLOGICO|INSTITUTO\s+MILITAR|ESCOLA\s+(?:SUPERIOR|POLITECNICA|DE\s+ENGENHARIA|DE\s+ADMINISTRACAO|DE\s+MINAS|PAULISTA|SUPERIOR)|FUNDACAO\s+(?:GETULIO|UNIVERSIDADE|EDUCACIONAL|UNIVERSITARIA))\b/;

/**
 * Extrai o nome da IES a partir da razão social registrada na Receita Federal,
 * ex.: "EMPRESA JUNIOR DE ENGENHARIA DA UNIVERSIDADE ESTADUAL DE LONDRINA" → "Universidade Estadual de Londrina".
 * Retorna null se a razão social não citar explicitamente uma instituição.
 */
export function extrairIesDaRazaoSocial(razao: string | null | undefined): string | null {
  if (!razao) return null;
  const semAcento = removerAcentos(razao).toUpperCase();
  const m = RE_IES.exec(semAcento);
  if (!m) return null;
  // Usa o texto original (com acentos) a partir da mesma posição.
  let trecho = razao.slice(m.index);
  // Corta em " - ", "- ", " -", parênteses, barra ou vírgula (mantém hífens internos como "Del-Rei").
  trecho = trecho.replace(/-(CURSO|CAMPUS)\b.*$/i, '');
  trecho = trecho.split(/\s*[-–]\s+|\s+[-–]\s*|\s*[(/]/)[0];
  trecho = trecho.replace(/\s+(EMPRESA\s+)?(JUNIOR|JR)\.?$/i, '');
  trecho = trecho.replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A)\.?$/i, '').trim();
  if (trecho.split(' ').length < 2) return null;
  return normalizarNomeIes(trecho);
}

export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string) => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12));
  const d2 = calc(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

/** Retorna o CNPJ só com dígitos (14) se for válido; senão null. */
export function normalizarCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  let d = cnpj.replace(/\D/g, '');
  if (d.length > 0 && d.length < 14) d = d.padStart(14, '0');
  return cnpjValido(d) ? d : null;
}

export function formatarCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj || cnpj.length !== 14) return cnpj ?? null;
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function normalizarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let v = url.trim();
  if (!v || /^(null|undefined|-|n\/a)$/i.test(v)) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v.replace(/^\/+/, '')}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes('.')) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** Canonicaliza perfil do Instagram para https://www.instagram.com/<handle>/ */
export function normalizarInstagram(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let handle: string | null = null;
  const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(s);
  if (m) handle = m[1];
  else if (/^@?[A-Za-z0-9._]{2,30}$/.test(s)) handle = s.replace(/^@/, '');
  if (!handle || ['p', 'reel', 'explore', 'accounts'].includes(handle.toLowerCase())) return null;
  return `https://www.instagram.com/${handle.toLowerCase()}/`;
}

export function normalizarEmail(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export function normalizarTelefone(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length >= 10 && d.length <= 11 ? d : null;
}

/** Chave de deduplicação: CNPJ quando houver; senão nome normalizado + IES normalizada + UF. */
export function chaveDedupe(ej: Pick<EjColetada, 'cnpj' | 'nome' | 'ies' | 'uf'>): string {
  const cnpj = normalizarCnpj(ej.cnpj);
  if (cnpj) return `cnpj:${cnpj}`;
  return `nome:${chaveNome(ej.nome)}|ies:${chaveNome(ej.ies)}|uf:${normalizarUf(ej.uf) ?? ''}`;
}

function uniao(a: string[], b: string[]): string[] {
  const vistos = new Map<string, string>();
  for (const x of [...a, ...b]) {
    const k = chaveNome(x);
    if (k && !vistos.has(k)) vistos.set(k, x);
  }
  return [...vistos.values()];
}

/** Mescla dois registros da mesma EJ: mantém valores do primeiro e completa os nulos com o segundo. */
export function mesclarEj(a: EjColetada, b: EjColetada): EjColetada {
  const out: EjColetada = { ...a };
  for (const k of Object.keys(b) as (keyof EjColetada)[]) {
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va) && Array.isArray(vb)) {
      (out as unknown as Record<string, unknown>)[k] = uniao(va, vb);
    } else if ((va === null || va === undefined || va === '') && vb !== null && vb !== undefined) {
      (out as unknown as Record<string, unknown>)[k] = vb;
    }
  }
  out.verificado = a.verificado || b.verificado;
  out.fontes = uniao([a.fonteUrl, ...a.fontes], [b.fonteUrl, ...b.fontes]);
  out.coletadoEm = a.coletadoEm > b.coletadoEm ? a.coletadoEm : b.coletadoEm;
  return out;
}

/**
 * Deduplica EJs. Duas EJs são a mesma se têm o mesmo CNPJ, ou (na falta de CNPJ em uma delas)
 * o mesmo nome normalizado + mesma IES normalizada + mesma UF. Um registro sem CNPJ e sem IES
 * também casa com um registro com CNPJ de mesmo nome normalizado e mesma UF.
 */
export function deduplicarEjs(lista: EjColetada[]): EjColetada[] {
  const porChave = new Map<string, EjColetada>();
  const porNomeUf = new Map<string, string>(); // nome|uf -> chave principal
  for (const ej of lista) {
    const nomeUf = `${chaveNome(ej.nome)}|${normalizarUf(ej.uf) ?? ''}`;
    let chave = chaveDedupe(ej);
    if (!porChave.has(chave)) {
      const alternativa = porNomeUf.get(nomeUf);
      const semIdForte = !normalizarCnpj(ej.cnpj);
      if (
        alternativa &&
        (semIdForte || !normalizarCnpj(porChave.get(alternativa)?.cnpj)) &&
        normalizarUf(ej.uf)
      ) {
        const existente = porChave.get(alternativa)!;
        const iesCompativel =
          !ej.ies || !existente.ies || chaveNome(ej.ies) === chaveNome(existente.ies);
        if (iesCompativel) chave = alternativa;
      }
    }
    const atual = porChave.get(chave);
    porChave.set(chave, atual ? mesclarEj(atual, ej) : ej);
    if (!porNomeUf.has(nomeUf)) porNomeUf.set(nomeUf, chave);
  }
  return [...porChave.values()];
}

const TOKENS_INSTITUCIONAIS = [
  'contato',
  'contatos',
  'ej',
  'jr',
  'junior',
  'empresa',
  'comercial',
  'presidencia',
  'diretoria',
  'projetos',
  'atendimento',
  'negocios',
  'marketing',
  'rh',
  'secretaria',
  'adm',
  'administrativo',
  'financeiro',
  'vendas',
  'gestao',
  'consultoria',
  'oficial',
  'parcerias',
  'institucional',
];

/**
 * LGPD: mantém o e-mail apenas se ele for claramente institucional — a parte local
 * contém o nome da EJ (ou parte dele) ou um termo institucional (contato@, comercial@, ...).
 * E-mails que parecem pessoais (ex.: joao.silva@...) são descartados.
 */
export function emailInstitucional(
  email: string | null | undefined,
  nomeEj: string,
): string | null {
  const e = normalizarEmail(email);
  if (!e) return null;
  const local = removerAcentos(e.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const tokensNome = chaveNome(nomeEj)
    .split(' ')
    .filter((t) => t.length >= 3 && !['jr', 'empresa', 'consultoria'].includes(t));
  const compacto = chaveNome(nomeEj).replace(/ /g, '');
  const casaNome =
    tokensNome.some((t) => local.includes(t)) || (compacto.length >= 3 && local.includes(compacto));
  const casaInstitucional = TOKENS_INSTITUCIONAIS.some((t) => local.includes(t));
  return casaNome || casaInstitucional ? e : null;
}

/**
 * LGPD: mantém apenas telefones fixos (prováveis números institucionais). Celulares
 * (11 dígitos com 9, ou 10 dígitos começando com 6–9 no formato antigo) costumam ser de
 * membros e são descartados.
 */
export function telefoneInstitucional(tel: string | null | undefined): string | null {
  const t = normalizarTelefone(tel);
  if (!t) return null;
  const assinante = t.slice(2);
  if (assinante.length === 9) return null;
  if (/^[6-9]/.test(assinante)) return null;
  return t;
}

const SIGLAS_IES_CONHECIDAS = [
  'USP',
  'UNESP',
  'UNICAMP',
  'UNIFESP',
  'UNB',
  'PUC',
  'UTFPR',
  'UNIRIO',
  'UNIFEI',
  'UNIVASF',
  'UNIPAMPA',
  'UNILA',
  'UNIFAL',
  'UNIOESTE',
  'UNEB',
  'UNIMONTES',
  'UNICENTRO',
  'FURG',
  'FATEC',
  'FGV',
  'ESPM',
  'IBMEC',
  'INSPER',
  'MACKENZIE',
  'CEFET',
  'IME',
  'ITA',
  'UNISOCIESC',
  'UNISINOS',
  'UNIVALI',
  'UNIFOR',
  'UNICAP',
  'UNITAU',
  'UNIFRAN',
  'UNICEUB',
  'UDESC',
  'UNEMAT',
  'UNIR',
  'UNIFAP',
  'UNILAB',
  'UNIVATES',
  'UNIJUI',
  'UNISC',
  'UNOESTE',
  'UNIFACS',
  'UNIT',
  'UNIPE',
  'UNIRV',
  'UNIVAP',
  'UNIMEP',
  'UNIP',
  'UNIFIEO',
  'FECAP',
  'FEI',
  'FAAP',
  'UNIFESSPA',
  'UNIFAP',
  'UNESC',
  'UNOCHAPECO',
  'UNIPLAC',
  'UNIARP',
  'UNIFAE',
  'UNIOSTE',
  'UNISUL',
  'UNIFEBE',
  'UNICESUMAR',
  'UNIFAN',
  'UNIEVANGELICA',
  'UNICEPLAC',
  'UPE',
  'UPF',
  'UCS',
  'UCSAL',
  'UCPEL',
  'UCB',
  'UCDB',
  'UCSAL',
  'UNIFOA',
  'UNIGRANRIO',
  'UNIABEU',
  'UNIVERSO',
  'UVA',
  'UNISUAM',
];

// UFxx (federais), UExx (estaduais), IFxx (institutos federais), PUC-xx, CEFET-xx e a lista acima.
const RE_SIGLA_IES = new RegExp(
  `(?:^|[^A-Z0-9])((?:UF[A-Z]{1,6}|UE[A-Z]{1,5}|IF[A-Z]{1,6}|PUC(?:[- ]?[A-Z]{2,4})?|CEFET(?:[- ]?[A-Z]{2,4})?|${SIGLAS_IES_CONHECIDAS.join('|')}))(?![A-Z0-9])`,
);
const FALSOS_POSITIVOS_SIGLA = new Set(['UFA', 'IFS']);

/**
 * Extrai a sigla de uma IES citada literalmente no texto (razão social ou nome da EJ),
 * ex.: "EMPRESA JUNIOR DE RELACOES INTERNACIONAIS DA UFRRJ" → "UFRRJ", "3E-UEL" → "UEL".
 * Só reconhece padrões de siglas de IES (UF*, UE*, IF*, PUC, CEFET) e uma lista de siglas conhecidas.
 */
export function extrairSiglaIes(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = removerAcentos(texto).toUpperCase();
  const m = RE_SIGLA_IES.exec(t);
  if (!m) return null;
  const sigla = m[1].replace(/\s+/g, '-');
  return FALSOS_POSITIVOS_SIGLA.has(sigla) ? null : sigla;
}
