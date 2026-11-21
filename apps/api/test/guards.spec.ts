import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Papel } from '@prisma/client';
import { Papeis } from '../src/auth/decorators/papeis.decorator';
import { Public } from '../src/auth/decorators/public.decorator';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import type { PrismaService } from '../src/prisma/prisma.service';

class Rotas {
  @Papeis('ADMIN')
  soAdmin() {}

  @Papeis('ADMIN', 'GESTOR')
  gestao() {}

  livreParaLogados() {}

  @Public()
  publica() {}
}

function ctx(handler: keyof Rotas, req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => Rotas.prototype[handler],
    getClass: () => Rotas,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const comPapel = (papel: Papel) => ({ usuario: { id: 'u', email: 'e', nome: 'n', papel } });

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('ADMIN acessa rota exclusiva de ADMIN', () => {
    expect(guard.canActivate(ctx('soAdmin', comPapel('ADMIN')))).toBe(true);
  });

  it.each<Papel>(['GESTOR', 'SDR'])('%s é bloqueado em rota exclusiva de ADMIN', (papel) => {
    expect(() => guard.canActivate(ctx('soAdmin', comPapel(papel)))).toThrow(ForbiddenException);
  });

  it('aceita qualquer um dos papéis listados', () => {
    expect(guard.canActivate(ctx('gestao', comPapel('GESTOR')))).toBe(true);
    expect(() => guard.canActivate(ctx('gestao', comPapel('SDR')))).toThrow(ForbiddenException);
  });

  it('rota sem @Papeis aceita qualquer usuário autenticado', () => {
    expect(guard.canActivate(ctx('livreParaLogados', comPapel('SDR')))).toBe(true);
  });

  it('bloqueia quando não há usuário na requisição', () => {
    expect(() => guard.canActivate(ctx('soAdmin', {}))).toThrow(ForbiddenException);
  });
});

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'segredo-de-teste-com-tamanho-suficiente' });
  const prisma = { usuario: { findUnique: jest.fn() } };
  const guard = new JwtAuthGuard(new Reflector(), jwt, prisma as unknown as PrismaService);

  beforeEach(() => prisma.usuario.findUnique.mockReset());

  it('libera rota @Public sem token', async () => {
    await expect(guard.canActivate(ctx('publica', { headers: {} }))).resolves.toBe(true);
  });

  it('exige Bearer token', async () => {
    await expect(
      guard.canActivate(ctx('livreParaLogados', { headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita token assinado com outro segredo', async () => {
    const falso = await new JwtService({ secret: 'outro-segredo-qualquer-123456' }).signAsync({
      sub: 'u1',
    });
    await expect(
      guard.canActivate(ctx('livreParaLogados', { headers: { authorization: `Bearer ${falso}` } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('aceita token válido de usuário ativo e anexa o usuário à requisição', async () => {
    const token = await jwt.signAsync({ sub: 'u1', papel: 'SDR', email: 'a@b.c' });
    prisma.usuario.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      nome: 'A',
      papel: 'SDR',
      ativo: true,
    });
    const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(ctx('livreParaLogados', req))).resolves.toBe(true);
    expect(req.usuario).toEqual({ id: 'u1', email: 'a@b.c', nome: 'A', papel: 'SDR' });
  });

  it('rejeita token válido de usuário desativado', async () => {
    const token = await jwt.signAsync({ sub: 'u1', papel: 'SDR', email: 'a@b.c' });
    prisma.usuario.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      nome: 'A',
      papel: 'SDR',
      ativo: false,
    });
    await expect(
      guard.canActivate(ctx('livreParaLogados', { headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
