import { ForbiddenException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/auth.types';

/** GESTOR/ADMIN editam tudo; SDR só EJs cujo responsável é ele. */
export function podeEditarEj(
  usuario: Pick<UsuarioAutenticado, 'id' | 'papel'>,
  ej: { responsavelId: string | null },
): boolean {
  return usuario.papel !== 'SDR' || ej.responsavelId === usuario.id;
}

export function exigirEdicaoEj(
  usuario: Pick<UsuarioAutenticado, 'id' | 'papel'>,
  ej: { responsavelId: string | null },
) {
  if (!podeEditarEj(usuario, ej)) {
    throw new ForbiddenException('Você só pode editar Empresas Juniores da sua carteira');
  }
}
