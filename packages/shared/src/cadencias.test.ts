import { describe, expect, it } from 'vitest';
import {
  criarTemplateSchema,
  renderizarTemplate,
  variaveisDesconhecidas,
} from './cadencias';

describe('renderizarTemplate', () => {
  it('substitui variáveis (com espaços internos)', () => {
    expect(renderizarTemplate('Oi {{nome_contato}}, da {{ nome_ej }}!', { nome_contato: 'Ana', nome_ej: 'Alfa' })).toBe(
      'Oi Ana, da Alfa!',
    );
  });
  it('variável sem dado vira vazio, sem deixar espaços/pontuação soltos', () => {
    expect(renderizarTemplate('Olá {{nome_contato}}, como {{cargo}}.', { nome_contato: 'Ana', cargo: null })).toBe(
      'Olá Ana, como.',
    );
    expect(renderizarTemplate('a {{ies}} b', {})).toBe('a b');
  });
  it('desconhecida vira vazio e quebras de linha são preservadas', () => {
    expect(renderizarTemplate('x{{foo}}\n\ny', {})).toBe('x\n\ny');
  });
});

describe('validação de template', () => {
  it('detecta variáveis desconhecidas', () => {
    expect(variaveisDesconhecidas('{{nome_ej}} {{x}} {{y}}')).toEqual(['x', 'y']);
  });
  it('rejeita corpo/assunto com variável desconhecida e assunto fora de e-mail', () => {
    const base = { nome: 'T1', canal: 'EMAIL', corpo: 'Oi {{nome_ej}}' };
    expect(criarTemplateSchema.safeParse(base).success).toBe(true);
    expect(criarTemplateSchema.safeParse({ ...base, corpo: 'Oi {{telefone}}' }).success).toBe(false);
    expect(criarTemplateSchema.safeParse({ ...base, assunto: '{{zzz}}' }).success).toBe(false);
    expect(criarTemplateSchema.safeParse({ ...base, canal: 'WHATSAPP', assunto: 'a' }).success).toBe(false);
  });
});
