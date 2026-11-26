import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthService } from '../src/auth/auth.service';
import type { SenhaService } from '../src/auth/senha.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { UsuariosService } from '../src/usuarios/usuarios.service';

function montar(alvo: object | null) {
  const prisma = {
    usuario: { findUnique: jest.fn().mockResolvedValue(alvo) },
    tokenRedefinicaoSenha: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const expiraEm = new Date('2026-11-27T12:00:00Z');
  const auth = {
    gerarLinkRedefinicao: jest
      .fn()
      .mockResolvedValue({ link: 'https://site/redefinir-senha?token=abc', expiraEm }),
  };
  const svc = new UsuariosService(
    prisma as unknown as PrismaService,
    {} as SenhaService,
    auth as unknown as AuthService,
  );
  return { prisma, auth, svc };
}

describe('Link de redefinição gerado pelo ADMIN', () => {
  it('invalida links anteriores, gera um de 24 h e audita', async () => {
    const { prisma, auth, svc } = montar({ id: 'u1', email: 'a@b.c', ativo: true });
    const r = await svc.linkRedefinicao('u1', 'admin');
    expect(r.link).toContain('/redefinir-senha?token=');
    expect(prisma.tokenRedefinicaoSenha.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuarioId: 'u1', usadoEm: null } }),
    );
    expect(auth.gerarLinkRedefinicao).toHaveBeenCalledWith('u1', 24 * 60 * 60 * 1000);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      usuarioId: 'admin',
      acao: 'LINK_REDEFINICAO_GERADO',
      entidadeId: 'u1',
    });
  });

  it('recusa usuário inexistente ou desativado', async () => {
    await expect(montar(null).svc.linkRedefinicao('x', 'admin')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      montar({ id: 'u1', email: 'a@b.c', ativo: false }).svc.linkRedefinicao('u1', 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
