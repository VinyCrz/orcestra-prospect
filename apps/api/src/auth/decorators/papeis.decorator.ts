import { SetMetadata } from '@nestjs/common';
import type { Papel } from '@prisma/client';

export const PAPEIS_KEY = 'papeis';
/** Restringe a rota aos papéis informados. */
export const Papeis = (...papeis: Papel[]) => SetMetadata(PAPEIS_KEY, papeis);
