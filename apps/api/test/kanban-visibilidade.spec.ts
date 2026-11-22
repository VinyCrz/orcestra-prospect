import { KanbanService } from '../src/funil/kanban.service';
import { EmpresasJunioresService } from '../src/empresas-juniores/empresas-juniores.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const usuario = { id: 'g1', email: '', nome: 'G', papel: 'GESTOR' } as never;
const contemVisivel = (where: unknown) => JSON.stringify(where).includes('"temContato":true');

describe('visibilidade de EJs (temContato)', () => {
  it('kanban filtra temContato em todas as colunas', async () => {
    const empresaJunior = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
    await new KanbanService({ empresaJunior } as unknown as PrismaService).obter({ limite: 10 } as never, usuario);
    expect(empresaJunior.findMany).toHaveBeenCalled();
    for (const [arg] of empresaJunior.findMany.mock.calls) expect(contemVisivel(arg.where)).toBe(true);
    for (const [arg] of empresaJunior.count.mock.calls) expect(contemVisivel(arg.where)).toBe(true);
  });

  it('lista filtra temContato', async () => {
    const empresaJunior = { count: jest.fn(), findMany: jest.fn() };
    const prisma = { empresaJunior, $transaction: jest.fn().mockResolvedValue([0, []]) };
    await new EmpresasJunioresService(prisma as never, {} as never, {} as never, {} as never).listar(
      { page: 1, pageSize: 10, ordenarPor: 'nome', ordem: 'asc' } as never,
      usuario,
    );
    expect(contemVisivel(empresaJunior.findMany.mock.calls[0][0].where)).toBe(true);
  });

  it('deduplicação considera TODAS as EJs (sem filtro de temContato)', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'x', nome: 'Oculta', cnpj: null, uf: 'SP', chaveDedupe: 'k', ies: null }]);
    const svc = new EmpresasJunioresService({ empresaJunior: { findMany } } as never, {} as never, {} as never, {} as never);
    await expect(
      (svc as unknown as { exigirSemDuplicado: (p: unknown) => Promise<void> }).exigirSemDuplicado({
        cnpj: null, nome: 'Oculta', uf: 'SP', iesNome: null, chave: 'k',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).not.toContain('temContato');
  });
});
