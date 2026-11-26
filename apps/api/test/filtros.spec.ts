import { filtrosEjSchema } from '@orcestra/shared';
import { montarWhere } from '../src/empresas-juniores/filtros';

describe('filtro comContato', () => {
  it('converte "true"/"false" da query em booleano', () => {
    expect(filtrosEjSchema.parse({ comContato: 'true' }).comContato).toBe(true);
    expect(filtrosEjSchema.parse({ comContato: 'false' }).comContato).toBe(false);
    expect(filtrosEjSchema.parse({}).comContato).toBeUndefined();
  });

  it('todo where inclui temContato=true (EJ visível)', () => {
    expect(montarWhere({}, 'u1')).toEqual({ AND: [{ temContato: true }] });
    const w = montarWhere({ uf: ['SP'], comContato: true }, 'u1') as { AND: unknown[] };
    expect(w.AND[0]).toEqual({ temContato: true });
    expect(w.AND).toHaveLength(2); // comContato=true é redundante
  });

  it('comContato=false contradiz a visibilidade (resultado vazio)', () => {
    const w = montarWhere({ comContato: false }, 'u1') as { AND: unknown[] };
    expect(w.AND).toEqual([{ temContato: true }, { temContato: false }]);
  });
});

describe('filtro por canais de contato', () => {
  const ultimo = (f: Parameters<typeof montarWhere>[0]) => (montarWhere(f, 'u1') as { AND: unknown[] }).AND.at(-1);

  it('algum (padrão): tem e-mail OU LinkedIn', () => {
    expect(ultimo({ canais: ['email', 'linkedin'] })).toEqual({
      OR: [{ emailInstitucional: { not: null } }, { linkedin: { not: null } }],
    });
  });

  it('todos: tem site E Instagram', () => {
    expect(ultimo({ canais: ['site', 'instagram'], canaisModo: 'todos' })).toEqual({
      AND: [{ site: { not: null } }, { instagram: { not: null } }],
    });
  });

  it('apenas: tem e-mail e nenhum outro canal', () => {
    expect(ultimo({ canais: ['email'], canaisModo: 'apenas' })).toEqual({
      AND: [
        { OR: [{ emailInstitucional: { not: null } }] },
        { site: null },
        { instagram: null },
        { linkedin: null },
        { telefoneInstitucional: null },
      ],
    });
  });
});
