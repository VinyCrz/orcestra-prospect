import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  atualizarUsuarioSchema,
  codigoCadastroSchema,
  criarUsuarioSchema,
  type AtualizarUsuarioInput,
  type CodigoCadastroInput,
  type CriarUsuarioInput,
} from '@orcestra/shared';
import { CodigoCadastroDto } from '../auth/auth.dto';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { CadastroService } from '../auth/cadastro.service';
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
  constructor(
    private readonly usuarios: UsuariosService,
    private readonly cadastro: CadastroService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista usuários (somente ADMIN).' })
  listar() {
    return this.usuarios.listar();
  }

  // antes de ':id' para não ser lida como id
  @Get('codigo-cadastro')
  @ApiOperation({ summary: 'Diz se há código da equipe para o autocadastro (somente ADMIN).' })
  statusCodigo() {
    return this.cadastro.statusCodigo();
  }

  @Put('codigo-cadastro')
  @ApiBody({ type: CodigoCadastroDto })
  @ApiOperation({ summary: 'Define ou troca o código da equipe; null fecha o cadastro (ADMIN).' })
  definirCodigo(
    @Body(new ZodValidationPipe(codigoCadastroSchema)) body: CodigoCadastroInput,
    @UsuarioAtual() autor: UsuarioAutenticado,
  ) {
    return this.cadastro.definirCodigo(body.codigo, autor.id);
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

  @Post(':id/link-redefinicao')
  @ApiOperation({
    summary: 'Gera link de redefinição de senha (24 h, uso único) para o ADMIN enviar (somente ADMIN).',
  })
  linkRedefinicao(@Param('id') id: string, @UsuarioAtual() autor: UsuarioAutenticado) {
    return this.usuarios.linkRedefinicao(id, autor.id);
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
