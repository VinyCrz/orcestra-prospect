import { ForbiddenException } from '@nestjs/common';
import { StatusService } from '../src/funil/status.service';
import type { AuditService } from '../src/common/audit.service';
import { ContatosService } from '../src/contatos/contatos.service';
import { EmpresasJunioresService } from '../src/empresas-juniores/empresas-juniores.service';
import { podeEditarEj } from '../src/empresas-juniores/permissoes';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AcoesEmMassaService } from '../src/empresas-juniores/acoes-em-massa.service';
import type { UsuarioAutenticado } from '../src/auth/auth.types';
import type { ScoreService } from '../src/score/score.service';

const score = { recalcularEj: jest.fn(), recalcularEjs: jest.fn() } as unknown as ScoreService;

const sdr: UsuarioAutenticado = { id: 'sdr1', email: 's@x.com', nome: 'SDR', papel: 'SDR' };
const gestor: UsuarioAutenticado = { id: 'g1', email: 'g@x.com', nome: 'G', papel: 'GESTOR' };

describe('permissão de edição por carteira', () => {
  it('regra pura', () => {
    expect(podeEditarEj(sdr, { responsavelId: 'sdr1' })).toBe(true);
    expect(podeEditarEj(sdr, { responsavelId: 'outro' })).toBe(false);
    expect(podeEditarEj(sdr, { responsavelId: null })).toBe(false);
    expect(podeEditarEj(gestor, { responsavelId: 'outro' })).toBe(true);
  });

  it('SDR editando EJ de outro responsável recebe 403 (PATCH EJ)', async () => {
    const prisma = {
      empresaJunior: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ej1', responsavelId: 'outro', tags: [], ies: null }),
      },
    } as unknown as PrismaService;
    const svc = new EmpresasJunioresService(prisma, {} as AuditService, {} as StatusService, score);
    await expect(svc.atualizar('ej1', { cidade: 'Porto Alegre' }, sdr)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('SDR não pode trocar o responsável nem na própria EJ', async () => {
    const prisma = {
      empresaJunior: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ej1', responsavelId: 'sdr1', tags: [], ies: null }),
      },
    } as unknown as PrismaService;
    const svc = new EmpresasJunioresService(prisma, {} as AuditService, {} as StatusService, score);
    await expect(svc.atualizar('ej1', { responsavelId: 'sdr2' }, sdr)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('SDR criando/editando contato de EJ fora da carteira recebe 403', async () => {
    const prisma = {
      empresaJunior: { findUnique: jest.fn().mockResolvedValue({ id: 'ej1', responsavelId: 'outro' }) },
      contato: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', empresaJuniorId: 'ej1' }) },
    } as unknown as PrismaService;
    const svc = new ContatosService(prisma, {} as AuditService, score);
    await expect(
      svc.criar('ej1', { nome: 'Fulano', cargo: 'OUTRO', baseLegal: 'LEGITIMO_INTERESSE_B2B' }, sdr),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.atualizar('c1', { nome: 'Novo Nome' }, sdr)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.excluir('c1', sdr)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SDR não pode atribuir responsável em massa', async () => {
    const svc = new AcoesEmMassaService({} as PrismaService, {} as AuditService, {} as StatusService, score);
    await expect(
      svc.executar({ ids: ['a'], acao: 'ATRIBUIR_RESPONSAVEL', valor: 'sdr1' }, sdr),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ação em massa de SDR só altera EJs da carteira e conta o resto como semPermissao', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { empresaJunior: { updateMany }, historicoStatus: { createMany: jest.fn() } };
    const prisma = {
      empresaJunior: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', responsavelId: 'sdr1', statusProspeccao: 'NAO_TRABALHADA' },
          { id: 'b', responsavelId: 'outro', statusProspeccao: 'NAO_TRABALHADA' },
        ]),
      },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const audit = { registrarVarios: jest.fn() } as unknown as AuditService;
    const r = await new AcoesEmMassaService(prisma, audit, new StatusService(prisma, audit), score).executar(
      { ids: ['a', 'b'], acao: 'MUDAR_STATUS', valor: 'PESQUISADA' },
      sdr,
    );
    expect(r).toMatchObject({ selecionadas: 2, alteradas: 1, semPermissao: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] } },
      data: expect.objectContaining({ statusProspeccao: 'PESQUISADA' }),
    });
  });
});
