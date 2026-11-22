import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Usuario } from '@prisma/client';
import { AuthService, sha256 } from '../src/auth/auth.service';
import { SenhaService } from '../src/auth/senha.service';
import type { AuditService } from '../src/common/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const SEGREDO = 'segredo-de-teste-com-tamanho-suficiente';

function usuario(p: Partial<Usuario> = {}): Usuario {
  return {
    id: 'u1',
    nome: 'Ana',
    email: 'ana@orcestra.com.br',
    senhaHash: 'hash',
    papel: 'SDR',
    ativo: true,
    ultimoLoginEm: null,
    criadoEm: new Date('2026-01-01'),
    atualizadoEm: new Date('2026-01-01'),
    ...p,
  };
}

function montar() {
  const prisma = {
    usuario: { findUnique: jest.fn(), update: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    tokenRedefinicaoSenha: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const audit = { registrar: jest.fn().mockResolvedValue(undefined) };
  const senhas = new SenhaService();
  const config = new ConfigService({ REFRESH_TOKEN_TTL_DIAS: 7, WEB_URL: 'http://localhost:3000' });
  const jwt = new JwtService({ secret: SEGREDO, signOptions: { expiresIn: '15m' } });
  const service = new AuthService(prisma as unknown as PrismaService, jwt, senhas, config, audit as unknown as AuditService);
  return { prisma, senhas, jwt, service, audit };
}

describe('AuthService — login', () => {
  it('autentica com senha correta, emite JWT com papel e grava refresh token com hash', async () => {
    const { prisma, senhas, jwt, service } = montar();
    const u = usuario({ senhaHash: await senhas.hash('senha-correta'), papel: 'GESTOR' });
    prisma.usuario.findUnique.mockResolvedValue(u);
    prisma.usuario.update.mockResolvedValue({ ...u, ultimoLoginEm: new Date() });

    const s = await service.login('ANA@orcestra.com.br', 'senha-correta', 'jest');

    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: 'ana@orcestra.com.br' },
    });
    const payload = await jwt.verifyAsync(s.accessToken);
    expect(payload).toMatchObject({ sub: 'u1', papel: 'GESTOR' });
    expect(s.refreshToken.length).toBeGreaterThan(40);
    const criado = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(criado.tokenHash).toBe(sha256(s.refreshToken));
    expect(criado.tokenHash).not.toBe(s.refreshToken);
    expect(s.usuario).not.toHaveProperty('senhaHash');
  });

  it('rejeita senha incorreta', async () => {
    const { prisma, senhas, service } = montar();
    prisma.usuario.findUnique.mockResolvedValue(
      usuario({ senhaHash: await senhas.hash('certa-123') }),
    );
    await expect(service.login('ana@orcestra.com.br', 'errada-123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejeita e-mail inexistente com a mesma mensagem', async () => {
    const { prisma, service } = montar();
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(service.login('x@y.com', 'qualquer')).rejects.toThrow('E-mail ou senha inválidos');
  });

  it('rejeita usuário desativado', async () => {
    const { prisma, senhas, service } = montar();
    prisma.usuario.findUnique.mockResolvedValue(
      usuario({ ativo: false, senhaHash: await senhas.hash('senha-123') }),
    );
    await expect(service.login('ana@orcestra.com.br', 'senha-123')).rejects.toThrow(/desativado/);
  });
});

describe('AuthService — refresh', () => {
  const registro = (p: object = {}) => ({
    id: 'rt1',
    usuarioId: 'u1',
    tokenHash: sha256('token-antigo'),
    expiraEm: new Date(Date.now() + 3600_000),
    revogadoEm: null,
    usuario: usuario(),
    ...p,
  });

  it('rotaciona: revoga o token usado e emite um novo', async () => {
    const { prisma, service } = montar();
    prisma.refreshToken.findUnique.mockResolvedValue(registro());
    const s = await service.refresh('token-antigo');
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256('token-antigo') } }),
    );
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt1' },
      data: { revogadoEm: expect.any(Date) },
    });
    expect(s.refreshToken).not.toBe('token-antigo');
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('rejeita sem cookie', async () => {
    const { service } = montar();
    await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita token desconhecido', async () => {
    const { prisma, service } = montar();
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.refresh('nao-existe')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita token expirado', async () => {
    const { prisma, service } = montar();
    prisma.refreshToken.findUnique.mockResolvedValue(
      registro({ expiraEm: new Date(Date.now() - 1000) }),
    );
    await expect(service.refresh('token-antigo')).rejects.toThrow('Sessão expirada');
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('detecta reuso de token revogado e derruba todas as sessões do usuário', async () => {
    const { prisma, service } = montar();
    prisma.refreshToken.findUnique.mockResolvedValue(registro({ revogadoEm: new Date() }));
    await expect(service.refresh('token-antigo')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u1', revogadoEm: null },
      data: { revogadoEm: expect.any(Date) },
    });
  });

  it('rejeita refresh de usuário desativado', async () => {
    const { prisma, service } = montar();
    prisma.refreshToken.findUnique.mockResolvedValue(
      registro({ usuario: usuario({ ativo: false }) }),
    );
    await expect(service.refresh('token-antigo')).rejects.toThrow(/desativado/);
  });
});

describe('AuthService — redefinição de senha', () => {
  it('não revela se o e-mail existe', async () => {
    const { prisma, service } = montar();
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(service.solicitarRedefinicao('ninguem@x.com')).resolves.toBeUndefined();
    expect(prisma.tokenRedefinicaoSenha.create).not.toHaveBeenCalled();
  });

  it('rejeita token já usado', async () => {
    const { prisma, service } = montar();
    prisma.tokenRedefinicaoSenha.findUnique.mockResolvedValue({
      id: 't',
      usuarioId: 'u1',
      usadoEm: new Date(),
      expiraEm: new Date(Date.now() + 1000),
    });
    await expect(service.redefinirSenha('token-qualquer', 'nova-senha-123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
