/**
 * Redes/sites de EJs encontrados por busca na web (data/redes-encontradas.json).
 *
 * Cada entrada foi confirmada por uma página pública (`evidencia`) que liga o perfil à EJ: nome igual
 * e cidade/IES compatíveis com o CNPJ. Só preenche campos vazios: o que veio de federação/IES prevalece.
 * O link de evidência entra em `fontes` da EJ. Entrada cujo CNPJ não existe mais na base é ignorada.
 */
import { readFile } from 'node:fs/promises';
import {
  emailInstitucional,
  normalizarCnpj,
  normalizarInstagram,
  normalizarTelefone,
  normalizarUrl,
  type EjColetada,
} from '@orcestra/shared';

export interface RedeEncontrada {
  cnpj: string;
  nome: string;
  uf: string;
  instagram?: string | null;
  site?: string | null;
  linkedin?: string | null;
  /** Só institucional (passa por `emailInstitucional`). */
  emailInstitucional?: string | null;
  /** Canal publicado pela EJ ou pela IES/federação como contato da EJ. */
  telefoneInstitucional?: string | null;
  /** URL pública que confirma o vínculo do perfil com a EJ. */
  evidencia: string;
  /** Como o vínculo foi confirmado (ex.: "bio do Instagram cita a IES e a cidade"). */
  criterio: string;
  verificadoEm: string;
}

export async function aplicarRedesEncontradas(
  ejs: EjColetada[],
  arquivo: string,
): Promise<{ entradas: number; aplicadas: number; semEj: string[] }> {
  let lista: RedeEncontrada[] = [];
  try {
    lista = JSON.parse(await readFile(arquivo, 'utf8')) as RedeEncontrada[];
  } catch {
    return { entradas: 0, aplicadas: 0, semEj: [] };
  }
  const porCnpj = new Map(ejs.filter((e) => e.cnpj).map((e) => [e.cnpj!, e]));
  let aplicadas = 0;
  const semEj: string[] = [];
  for (const r of lista) {
    const ej = porCnpj.get(normalizarCnpj(r.cnpj) ?? '');
    if (!ej) {
      semEj.push(r.nome);
      continue;
    }
    let mudou = false;
    const ig = normalizarInstagram(r.instagram);
    if (ig && !ej.instagram) {
      ej.instagram = ig;
      mudou = true;
    }
    const site = normalizarUrl(r.site);
    if (site && !ej.site) {
      ej.site = site;
      mudou = true;
    }
    const li = normalizarUrl(r.linkedin);
    if (li && !ej.linkedin) {
      ej.linkedin = li;
      mudou = true;
    }
    const email = emailInstitucional(r.emailInstitucional, ej.nome);
    if (email && !ej.emailInstitucional) {
      ej.emailInstitucional = email;
      mudou = true;
    }
    const tel = normalizarTelefone(r.telefoneInstitucional);
    if (tel && !ej.telefoneInstitucional) {
      ej.telefoneInstitucional = tel;
      mudou = true;
    }
    if (mudou) {
      aplicadas++;
      ej.fontes = [...new Set([...ej.fontes, r.evidencia])];
    }
  }
  return { entradas: lista.length, aplicadas, semEj };
}
