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
