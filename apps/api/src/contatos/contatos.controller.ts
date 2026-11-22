import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  anonimizarContatoSchema,
  atualizarContatoSchema,
  type AnonimizarContatoInput,
  CARGOS_CONTATO,
  BASES_LEGAIS,
  criarContatoSchema,
  type AtualizarContatoInput,
  type CriarContatoInput,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ContatosService } from './contatos.service';

class ContatoDto {
  @ApiProperty() nome: string;
  @ApiPropertyOptional({ enum: CARGOS_CONTATO, default: 'OUTRO' }) cargo?: string;
  @ApiPropertyOptional({ description: 'Texto livre (cargo OUTRO ou detalhe)' }) cargoDescricao?: string | null;
  @ApiPropertyOptional({ description: 'Salvo em minúsculas' }) email?: string | null;
  @ApiPropertyOptional({ description: 'DDD + número' }) telefone?: string | null;
  @ApiPropertyOptional() whatsapp?: string | null;
  @ApiPropertyOptional() linkedin?: string | null;
  @ApiPropertyOptional() principal?: boolean;
  @ApiPropertyOptional({ example: '2025-01-01' }) mandatoInicio?: string | null;
  @ApiPropertyOptional({ example: '2025-12-31' }) mandatoFim?: string | null;
  @ApiPropertyOptional({ enum: BASES_LEGAIS, default: 'LEGITIMO_INTERESSE_B2B' }) baseLegal?: string;
  @ApiPropertyOptional({ description: 'Padrão "manual"' }) fonte?: string | null;
  @ApiPropertyOptional({ description: 'Define optOutEm automaticamente' }) optOut?: boolean;
  @ApiPropertyOptional() optOutMotivo?: string | null;
}

@ApiTags('contatos')
@ApiBearerAuth()
@Controller()
export class ContatosController {
  constructor(private readonly service: ContatosService) {}

  @Get('empresas-juniores/:id/contatos')
  @ApiOperation({ summary: 'Lista contatos da EJ (inclui os com opt-out, sinalizados em `optOut`).' })
  listar(@Param('id') id: string) {
    return this.service.listar(id);
  }

  @Post('empresas-juniores/:id/contatos')
  @ApiBody({ type: ContatoDto })
  @ApiOperation({ summary: 'Cria contato (SDR só em EJ da sua carteira). AuditLog com dados pessoais mascarados.' })
  @ApiForbiddenResponse({ description: 'SDR fora da carteira' })
  criar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(criarContatoSchema)) body: CriarContatoInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.criar(id, body, u);
  }

  @Get('contatos/:id')
  @ApiOperation({ summary: 'Detalhe do contato.' })
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Patch('contatos/:id')
  @ApiBody({ type: ContatoDto })
  @ApiOperation({ summary: 'Edita contato (parcial; null limpa). Mesma regra de permissão da EJ.' })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarContatoSchema)) body: AtualizarContatoInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.atualizar(id, body, u);
  }

  @Delete('contatos/:id')
  @Papeis('ADMIN', 'GESTOR')
  @ApiOperation({ summary: 'Exclui contato (somente GESTOR/ADMIN). Um opt-out/anonimização permanece na lista de supressão.' })
  excluir(@Param('id') id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.excluir(id, u);
  }

  @Get('contatos/:id/exportar')
  @Papeis('ADMIN', 'GESTOR')
  @ApiOperation({ summary: 'Direito de acesso (LGPD): exporta todos os dados do contato em JSON (download). GESTOR/ADMIN.' })
  async exportar(
    @Param('id') id: string,
    @UsuarioAtual() u: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dados = await this.service.exportar(id, u);
    res.setHeader('Content-Disposition', `attachment; filename="contato-${id}.json"`);
    return dados;
  }

  @Post('contatos/:id/anonimizar')
  @HttpCode(200)
  @Papeis('ADMIN', 'GESTOR')
  @ApiBody({ schema: { properties: { confirmacao: { type: 'string', example: 'ANONIMIZAR' } } } })
  @ApiOperation({ summary: 'Direito de eliminação (LGPD): anonimiza o contato e o inclui na lista de supressão. GESTOR/ADMIN.' })
  anonimizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(anonimizarContatoSchema)) _body: AnonimizarContatoInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.anonimizar(id, u);
  }
}
