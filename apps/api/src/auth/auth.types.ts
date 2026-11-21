import type { Papel } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  papel: Papel;
  email: string;
}

export interface UsuarioAutenticado {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
}

export const REFRESH_COOKIE = 'orc_refresh';
