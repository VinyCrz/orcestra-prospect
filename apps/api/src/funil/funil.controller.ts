import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  kanbanQuerySchema,
  mudarStatusSchema,
  STATUS_PROSPECCAO,
  type KanbanQuery,
  type MudarStatusInput,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { KanbanService } from './kanban.service';
import { StatusService } from './status.service';

class MudarStatusDto {
  @ApiProperty({ enum: STATUS_PROSPECCAO }) status: string;
  @ApiPropertyOptional({ description: 'Obrigatório se status = PERDIDA (motivo ativo)' }) motivoPerdaId?: string;
  @ApiPropertyOptional() motivoPerdaDetalhe?: string;
  @ApiPropertyOptional({ example: '2026-12-01', description: 'Obrigatório se status = NUTRICAO' })
  dataRetornoNutricao?: string;
}

@ApiTags('funil')
@ApiBearerAuth()
@Controller()
export class FunilController {
  constructor(
    private readonly status: StatusService,
    private readonly kanban: KanbanService,
  ) {}

  @Patch('empresas-juniores/:id/status')
  @ApiOperation({
    summary: 'Muda o status da EJ no funil (kanban).',
    description:
      'PERDIDA exige `motivoPerdaId` ativo (400); NUTRICAO exige `dataRetornoNutricao` (400). Ao sair desses status os ' +
      'campos de perda/nutrição são limpos. Grava HistoricoStatus, statusAlteradoEm e AuditLog. SDR só na própria carteira.',
  })
  @ApiBody({ type: MudarStatusDto })
  @ApiForbiddenResponse({ description: 'SDR fora da carteira' })
  mudar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mudarStatusSchema)) body: MudarStatusInput,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.status.mudar(id, body, usuario);
  }

  @Post('empresas-juniores/:id/prospectar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Prospectar a EJ num clique: vai para a sua carteira e entra no funil.',
    description:
      'Sem responsável: passa a ser sua. Em NAO_TRABALHADA/PESQUISADA: vai para PRIMEIRO_CONTATO (com histórico e ' +
      'auditoria); mais à frente no funil, o status não muda. SDR não pega EJ da carteira de outra pessoa (403).',
  })
  @ApiForbiddenResponse({ description: 'SDR e EJ na carteira de outra pessoa' })
  prospectar(@Param('id') id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.status.prospectar(id, usuario);
  }

  @Get('funil/kanban')
  @ApiOperation({
    summary: 'Kanban do funil: por coluna, contagem total + primeiros `limite` cards.',
    description:
      'Sem `status`: todas as colunas (resposta `{colunas:[{status,total,items,proximoCursor}]}`). Com `status` e ' +
      '`cursor` (= `proximoCursor` anterior): próxima página só dessa coluna. Cards ordenados por score desc, nome.',
  })
  @ApiQuery({ name: 'responsavelId', required: false, description: 'Multi: ids, `nenhum` e/ou `eu`' })
  @ApiQuery({ name: 'uf', required: false, description: 'Multi: `RS,SC`' })
  @ApiQuery({ name: 'busca', required: false })
  @ApiQuery({ name: 'status', required: false, enum: STATUS_PROSPECCAO })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limite', required: false, type: Number, description: 'padrão 20, máx. 50' })
  obter(
    @Query(new ZodValidationPipe(kanbanQuerySchema)) q: KanbanQuery,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.kanban.obter(q, usuario);
  }
}
