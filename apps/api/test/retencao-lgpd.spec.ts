import { mascararEmail } from '../src/common/audit.service';
import { mensagemSegura } from '../src/importacoes/importacoes.executor';
import { normalizarLinhaContato, parseBaseLegal } from '../src/importacoes/linhas';

describe('LGPD na importação', () => {
  it('mascara e-mails com parte local curta', () => {
    expect(mascararEmail('ab@x.com')).toBe('a***@x.com');
    expect(mascararEmail('joao.silva@x.com')).toBe('jo***@x.com');
  });

  it('omite valores entre aspas nas mensagens de contatos', () => {
    expect(mensagemSegura('CONTATOS', 'E-mail inválido: "a@b"')).toBe('E-mail inválido: "…"');
    expect(mensagemSegura('EJS', 'CNPJ inválido: "1"')).toBe('CNPJ inválido: "1"');
  });

  it('base legal: padrão, rótulo e inválida', () => {
    expect(parseBaseLegal('')).toBe('LEGITIMO_INTERESSE_B2B');
    expect(parseBaseLegal('Consentimento')).toBe('CONSENTIMENTO');
    expect(parseBaseLegal('execucao de contrato')).toBe('EXECUCAO_CONTRATO');
    expect(parseBaseLegal('xyz')).toBeNull();
    const r = normalizarLinhaContato({ nome: 'Ana Souza', ejNome: 'EJ X', baseLegal: 'xyz' });
    expect(r.erros.some((e) => e.campo === 'baseLegal')).toBe(true);
  });
});
