import { filtrosEjSchema } from '@orcestra/shared';
import { montarWhere } from '../src/empresas-juniores/filtros';

describe('filtro comContato', () => {
  it('converte "true"/"false" da query em booleano', () => {
    expect(filtrosEjSchema.parse({ comContato: 'true' }).comContato).toBe(true);
    expect(filtrosEjSchema.parse({ comContato: 'false' }).comContato).toBe(false);
    expect(filtrosEjSchema.parse({}).comContato).toBeUndefined();
  });

  it('true: exige algum canal institucional ou contato liberado', () => {
    const w = montarWhere({ comContato: true }, 'u1') as { AND: { OR: Record<string, unknown>[] }[] };
    const or = w.AND[0].OR;
    const campos = or.flatMap((c) => Object.keys(c));
    expect(campos).toEqual(
      expect.arrayContaining(['site', 'instagram', 'linkedin', 'facebook', 'emailInstitucional', 'telefoneInstitucional', 'contatos']),
    );
    const contatos = or.find((c) => 'contatos' in c) as { contatos: { some: Record<string, unknown> } };
    expect(contatos.contatos.some).toMatchObject({ optOut: false, anonimizadoEm: null });
  });

  it('false: nega a mesma condição; sem filtro não restringe', () => {
    const w = montarWhere({ comContato: false }, 'u1') as { AND: { NOT: unknown }[] };
    expect(w.AND[0].NOT).toBeDefined();
    expect(montarWhere({}, 'u1')).toEqual({});
  });
});
