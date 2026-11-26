import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { cadastroSchema, codigoCadastroSchema } from '@orcestra/shared';
import { CadastroService } from '../src/auth/cadastro.service';
import { SenhaService } from '../src/auth/senha.service';
import type { AuditService } from '../src/common/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const DADOS = {
  nome: 'Maria',
  email: 'maria@exemplo.com',
  senha: 'Senha-forte-123',
  codigo: 'ORCESTRA2026',
};

function montar() {
  const prisma = {
    configSistema: { findUnique: jest.fn(), upsert: jest.fn() },
    usuario: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({
        id: 'novo',
        ...data,
        ativo: true,
        ultimoLoginEm: null,
        criadoEm: new Date('2026-11-26'),
        atualizadoEm: new Date('2026-11-26'),
      })),
    },
  };
  const audit = { registrar: jest.fn().mockResolvedValue(undefined) };
  const senhas = new SenhaService();
  const service = new CadastroService(
    prisma as unknown as PrismaService,
    senhas,
    audit as unknown as AuditService,
  );
  const comCodigo = async (codigo = 'ORCESTRA2026') =>
    prisma.configSistema.findUnique.mockResolvedValue({
      id: 1,
      codigoCadastroHash: await senhas.hash(codigo),
      codigoCadastroAlteradoEm: new Date(),
    });
  return { prisma, audit, senhas, service, comCodigo };
}

describe('Autocadastro com código da equipe', () => {
  it('fica fechado enquanto o ADMIN não define o código', async () => {
    const { prisma, service } = montar();
    prisma.configSistema.findUnique.mockResolvedValue(null);
    await expect(service.status()).resolves.toEqual({ aberto: false });
    await expect(service.cadastrar(DADOS)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('com o código certo cria a conta como SDR, com senha em hash, e audita', async () => {
    const { prisma, audit, service, comCodigo } = montar();
    await comCodigo();
    const u = await service.cadastrar(DADOS);
    expect(u).toMatchObject({ email: 'maria@exemplo.com', papel: 'SDR', ativo: true });
    expect(u).not.toHaveProperty('senhaHash');
    const data = prisma.usuario.create.mock.calls[0][0].data;
    expect(data.papel).toBe('SDR');
    expect(data.senhaHash).not.toBe(DADOS.senha);
    expect(audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'USUARIO_AUTOCADASTRO', usuarioId: 'novo' }),
    );
  });

  it('recusa código errado sem consultar o e-mail', async () => {
    const { prisma, audit, service, comCodigo } = montar();
    await comCodigo();
    await expect(service.cadastrar({ ...DADOS, codigo: 'errado' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    expect(prisma.usuario.create).not.toHaveBeenCalled();
    expect(audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'AUTOCADASTRO_RECUSADO' }),
    );
  });

  it('recusa e-mail que já tem conta', async () => {
    const { prisma, service, comCodigo } = montar();
    await comCodigo();
    prisma.usuario.findUnique.mockResolvedValue({ id: 'x' });
    await expect(service.cadastrar(DADOS)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('o ADMIN define e fecha o código; só o hash vai para o banco', async () => {
    const { prisma, audit, senhas, service } = montar();
    prisma.configSistema.findUnique.mockResolvedValue(null);
    await service.definirCodigo('NOVO-CODIGO-1', 'admin');
    const { create } = prisma.configSistema.upsert.mock.calls[0][0];
    expect(create.codigoCadastroHash).not.toBe('NOVO-CODIGO-1');
    await expect(senhas.verificar(create.codigoCadastroHash, 'NOVO-CODIGO-1')).resolves.toBe(true);
    expect(audit.registrar).toHaveBeenLastCalledWith(
      expect.objectContaining({ acao: 'CODIGO_CADASTRO_DEFINIDO', usuarioId: 'admin' }),
    );

    await service.definirCodigo(null, 'admin');
    expect(prisma.configSistema.upsert.mock.calls[1][0].update.codigoCadastroHash).toBeNull();
    expect(audit.registrar).toHaveBeenLastCalledWith(
      expect.objectContaining({ acao: 'CADASTRO_FECHADO' }),
    );
  });

  it('schemas: e-mail normalizado, senha forte e código com ao menos 8 caracteres', () => {
    expect(cadastroSchema.parse({ ...DADOS, email: ' Maria@Exemplo.COM ' }).email).toBe(
      'maria@exemplo.com',
    );
    expect(cadastroSchema.safeParse({ ...DADOS, senha: '123' }).success).toBe(false);
    expect(codigoCadastroSchema.safeParse({ codigo: 'curto' }).success).toBe(false);
    expect(codigoCadastroSchema.safeParse({ codigo: 'com espaco' }).success).toBe(false);
    expect(codigoCadastroSchema.parse({ codigo: null }).codigo).toBeNull();
  });
});
