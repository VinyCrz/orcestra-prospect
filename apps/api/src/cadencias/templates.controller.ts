import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  atualizarTemplateSchema,
  criarTemplateSchema,
  listarTemplatesQuerySchema,
  previsualizarTemplateSchema,
  type AtualizarTemplateInput,
  type CriarTemplateInput,
  type ListarTemplatesQuery,
  type PrevisualizarTemplateInput,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista templates (todos os papéis). Filtros: canal, ativo.' })
  @ApiQuery({ name: 'canal', required: false })
  @ApiQuery({ name: 'ativo', required: false, type: Boolean })
  listar(@Query(new ZodValidationPipe(listarTemplatesQuerySchema)) q: ListarTemplatesQuery) {
    return this.service.listar(q);
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Post()
  @Papeis('ADMIN', 'GESTOR')
  @ApiOperation({
    summary: 'Cria template. Variáveis: nome_ej, nome_contato, cargo, ies, cidade, nome_sdr (outras = 400).',
  })
  criar(
    @Body(new ZodValidationPipe(criarTemplateSchema)) body: CriarTemplateInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.criar(body, u);
  }

  @Patch(':id')
  @Papeis('ADMIN', 'GESTOR')
  @ApiOperation({ summary: 'Edita/desativa (`ativo: false`) o template. Não há exclusão.' })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarTemplateSchema)) body: AtualizarTemplateInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.atualizar(id, body, u);
  }

  @Post(':id/previsualizar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Renderiza o template: `{ejId?, contatoId?}` → `{canal, assunto, texto}`. Contato em opt-out = 422.',
  })
  previsualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(previsualizarTemplateSchema)) body: PrevisualizarTemplateInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.previsualizar(id, body, u);
  }
}
