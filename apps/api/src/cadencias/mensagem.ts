import { CARGO_CONTATO_LABEL, type CargoContato, type DadosTemplate } from '@orcestra/shared';

export interface FontesMensagem {
  ej: { nome: string; cidade?: string | null; ies?: { nome: string; cidade?: string | null } | null };
  contato?: { nome: string; cargo: string; cargoDescricao?: string | null } | null;
  nomeSdr?: string | null;
}

/** Variáveis do template a partir da EJ, do contato e do usuário. */
export function montarDados({ ej, contato, nomeSdr }: FontesMensagem): DadosTemplate {
  const cargo = contato
    ? contato.cargo === 'OUTRO'
      ? (contato.cargoDescricao ?? '')
      : (CARGO_CONTATO_LABEL[contato.cargo as CargoContato] ?? contato.cargoDescricao ?? '')
    : '';
  return {
    nome_ej: ej.nome,
    nome_contato: contato?.nome ?? '',
    cargo,
    ies: ej.ies?.nome ?? '',
    cidade: ej.cidade ?? ej.ies?.cidade ?? '',
    nome_sdr: nomeSdr ?? '',
  };
}

/** Número para wa.me: só dígitos, com DDI 55 se vier só com DDD (10/11 dígitos). null se inválido. */
export function numeroWaMe(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

export function montarLinks(
  canal: string,
  texto: string,
  assunto: string | null,
  contato: { email?: string | null; telefone?: string | null; whatsapp?: string | null },
): { waMe?: string; mailto?: string } {
  const links: { waMe?: string; mailto?: string } = {};
  if (canal === 'WHATSAPP') {
    const n = numeroWaMe(contato.whatsapp ?? contato.telefone);
    if (n) links.waMe = `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
  }
  // E-mail com ?, &, #, % ou espaço injetaria parâmetros no mailto: sem link nesse caso.
  if (canal === 'EMAIL' && contato.email && !/[?&#%\s]/.test(contato.email)) {
    const q = [assunto ? `subject=${encodeURIComponent(assunto)}` : '', `body=${encodeURIComponent(texto)}`]
      .filter(Boolean)
      .join('&');
    links.mailto = `mailto:${contato.email}?${q}`;
  }
  return links;
}
