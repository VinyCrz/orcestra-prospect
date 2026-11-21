import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  type AtualizarUsuarioInput,
  type CriarUsuarioInput,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AtualizarUsuarioDto, CriarUsuarioDto } from './usuarios.dto';
import { UsuariosService } from './usuarios.service';

@ApiTags('usuarios')
@ApiBearerAuth()
@Papeis('ADMIN')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista usuários (somente ADMIN).' })
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  @ApiBody({ type: CriarUsuarioDto })
  @ApiOperation({ summary: 'Cria usuário (somente ADMIN).' })
  criar(
    @Body(new ZodValidationPipe(criarUsuarioSchema)) body: CriarUsuarioInput,
    @UsuarioAtual() autor: UsuarioAutenticado,
  ) {
    return this.usuarios.criar(body, autor.id);
  }

  @Patch(':id')
  @ApiBody({ type: AtualizarUsuarioDto })
  @ApiOperation({ summary: 'Edita nome/papel ou ativa/desativa usuário (somente ADMIN).' })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarUsuarioSchema)) body: AtualizarUsuarioInput,
    @UsuarioAtual() autor: UsuarioAutenticado,
  ) {
    return this.usuarios.atualizar(id, body, autor.id);
  }
}
