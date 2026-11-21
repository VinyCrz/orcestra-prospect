import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { limparEspacos } from '@orcestra/shared';
import { obterArquivo } from '../http.js';
import { novaEj, type ResultadoFonte } from '../base.js';
import { casarComRegistro } from '../match.js';

const exec = promisify(execFile);

/**
 * "Empresas Juniores da Universidade Federal de Santa Catarina" (e-book da UFSC/PROPESQ/ProEx, 2023,
 * PDF público em via.ufsc.br): uma ficha por EJ da UFSC (todos os campi). Usamos SOMENTE o nome da
 * ficha para registrar a IES (Universidade Federal de Santa Catarina) das EJs que casam de forma
 * única (nome normalizado + UF=SC do CNPJ) com o cadastro nacional. E-mails, telefones e nomes de
 * pessoas das fichas NÃO são lidos (LGPD). Requer `pdftotext` (poppler-utils).
 */
const PDF = 'https://via.ufsc.br/wp-content/uploads/ebooks-EJS-oficial.pdf';
const PRIMEIRA = 14;
const ULTIMA = 59;

export async function coletarUfscEbook(coletadoEm: string): Promise<ResultadoFonte> {
  const arquivo = await obterArquivo(PDF, 'pdf');
  const nomes: string[] = [];
  for (let p = PRIMEIRA; p <= ULTIMA; p++) {
    const { stdout } = await exec('pdftotext', ['-f', String(p), '-l', String(p), '-layout', arquivo, '-']);
    const linhas = stdout.split('\n').filter((l) => l.trim());
    const l = linhas.slice(0, 6).find((x) => /CRIA[ÇC][ÃA]O:/.test(x));
    if (!l) continue;
    const nome = limparEspacos(l.trim().split(/\s{2,}/)[0]);
    if (nome && !/CRIA[ÇC][ÃA]O/.test(nome)) nomes.push(nome);
  }

  const ejs = [];
  const sem: string[] = [];
  for (const nome of nomes) {
    const reg = await casarComRegistro(nome, 'SC');
    if (!reg) {
      sem.push(nome);
      continue;
    }
    const ej = novaEj(reg.nome, PDF, coletadoEm);
    ej.fontes = [PDF];
    ej.cnpj = reg.cnpj;
    ej.idBrasilJunior = reg.bjId;
    ej.uf = 'SC';
    ej.regiao = 'SUL';
    ej.ies = 'Universidade Federal de Santa Catarina';
    ej.iesSigla = 'UFSC';
    ejs.push(ej);
  }
  return {
    fonte: 'UFSC — E-book "Empresas Juniores da UFSC" (2023)',
    url: PDF,
    ejs,
    federacoes: [],
    observacao:
      `${nomes.length} fichas lidas; ${ejs.length} casadas de forma única com o cadastro nacional (SC)` +
      (sem.length ? `; sem casamento (não incluídas): ${sem.join(', ')}` : ''),
  };
}
