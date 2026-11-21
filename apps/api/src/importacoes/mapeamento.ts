import { CAMPOS_IMPORTACAO, chaveNome, type TipoImportacao } from '@orcestra/shared';

/** Padrões (sobre o nome da coluna normalizado por chaveNome) -> campo do sistema. Ordem = prioridade. */
const PADROES: Record<TipoImportacao, [string, RegExp][]> = {
  EJS: [
    ['razaoSocial', /\brazao( social)?\b/],
    ['cnpj', /\bcnpj\b/],
    ['emailInstitucional', /\be ?mail\b|\bcorreio\b/],
    ['telefoneInstitucional', /\b(telefone|fone|tel|celular|contato telefonico)\b/],
    ['federacao', /\bfederacao\b|\bfederacao\b/],
    ['ies', /\b(ies|instituicao|universidade|faculdade)\b/],
    ['uf', /^(uf|estado|sigla uf|sigla do estado)$/],
    ['cidade', /\b(cidade|municipio)\b/],
    ['tags', /\b(tags?|areas?|area de atuacao|cursos?)\b/],
    ['servicos', /\bservicos?\b/],
    ['anoFundacao', /\b(ano( de)? (fundacao|criacao)|fundacao|fundada em)\b/],
    ['membrosEstimados', /\b(membros?|numero de membros|n de membros|qtd membros|integrantes)\b/],
    ['federada', /\bfederada\b/],
    ['site', /\b(site|website|pagina web|url)\b/],
    ['instagram', /\binstagram\b|^ig$/],
    ['linkedin', /\blinkedin\b/],
    ['facebook', /\bfacebook\b/],
    ['observacoes', /\b(observacao|observacoes|obs|notas?|comentarios?)\b/],
    ['nome', /\b(nome|empresa|ej|denominacao)\b/],
  ],
  CONTATOS: [
    ['ejCnpj', /\bcnpj\b/],
    ['ejUf', /\b(uf( da ej)?|estado)\b/],
    ['ejNome', /\b(empresa|ej|nome da ej|empresa junior|nome da empresa)\b/],
    ['email', /\be ?mail\b|\bcorreio\b/],
    ['whatsapp', /\b(whatsapp|whats|zap)\b/],
    ['telefone', /\b(telefone|fone|tel|celular)\b/],
    ['linkedin', /\blinkedin\b/],
    ['cargo', /\b(cargo|funcao|posicao|diretoria)\b/],
    ['mandatoInicio', /\b(inicio|mandato inicio|inicio do mandato|desde)\b/],
    ['mandatoFim', /\b(fim|termino|mandato fim|fim do mandato|ate)\b/],
    ['fonte', /\b(fonte|origem)\b/],
    ['nome', /\b(nome|contato|pessoa)\b/],
  ],
};

/** Sugere o campo do sistema para cada coluna (cada campo é usado por no máximo uma coluna). */
export function sugerirMapeamento(
  colunas: string[],
  tipo: TipoImportacao,
): Record<string, string | null> {
  const usados = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const col of colunas) {
    const k = chaveNome(col);
    let alvo: string | null = null;
    for (const [campo, re] of PADROES[tipo]) {
      if (!usados.has(campo) && re.test(k)) {
        alvo = campo;
        break;
      }
    }
    if (alvo) usados.add(alvo);
    out[col] = alvo;
  }
  return out;
}

/** Valida o mapeamento. Retorna lista de mensagens de erro (vazia = válido). */
export function validarMapeamento(
  mapeamento: Record<string, string | null>,
  colunas: string[],
  tipo: TipoImportacao,
): string[] {
  const erros: string[] = [];
  const campos = new Set(CAMPOS_IMPORTACAO[tipo].map((c) => c.campo));
  const usados = new Map<string, string>();
  for (const [col, campo] of Object.entries(mapeamento)) {
    if (!colunas.includes(col)) erros.push(`Coluna "${col}" não existe no arquivo`);
    if (!campo) continue;
    if (!campos.has(campo)) erros.push(`Campo "${campo}" inválido para importação de ${tipo}`);
    else if (usados.has(campo))
      erros.push(`O campo "${campo}" foi mapeado em mais de uma coluna ("${usados.get(campo)}" e "${col}")`);
    else usados.set(campo, col);
  }
  if (!usados.has('nome')) erros.push('Mapeie a coluna de nome');
  if (tipo === 'CONTATOS' && !usados.has('ejCnpj') && !usados.has('ejNome'))
    erros.push('Mapeie a EJ do contato por CNPJ ou por nome (e UF)');
  return erros;
}
