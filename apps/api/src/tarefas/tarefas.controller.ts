import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  adiarTarefaSchema,
  agendaQuerySchema,
  atualizarTarefaSchema,
  criarTarefaSchema,
  listarTarefasQuerySchema,
  ORIGENS_TAREFA,
  type AdiarTarefaInput,
  type AgendaQuery,
  type AtualizarTarefaInput,
  type CriarTarefaInput,
  type ListarTarefasQuery,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TarefasService } from './tarefas.service';

class TarefaDto {
  @ApiProperty() titulo: string;
  @ApiPropertyOptional() descricao?: string | null;
  @ApiProperty({ description: 'ISO ou AAAA-MM-DD (início do dia em America/Sao_Paulo)' }) vencimento: string;
  @ApiPropertyOptional({ description: 'Padrão: o próprio usuário. Outro usuário: só GESTOR/ADMIN' })
  responsavelId?: string;
  @ApiPropertyOptional() empresaJuniorId?: string | null;
  @ApiPropertyOptional() contatoId?: string | null;
}
class AdiarDto {
  @ApiPropertyOptional({ description: 'Nova data (não pode estar no passado)' }) novaData?: string;
  @ApiPropertyOptional({ description: 'Dias a somar a max(vencimento, hoje). Informe novaData OU dias' })
  dias?: number;
}

@ApiTags('tarefas')
@ApiBearerAuth()
@Controller('tarefas')
export class TarefasController {
  constructor(private readonly service: TarefasService) {}

  @Get('agenda')
  @ApiOperation({
    summary: 'Minha agenda: pendentes agrupadas em atrasadas, hoje e próximos 7 dias (America/Sao_Paulo).',
    description: 'Resposta: `{atrasadas, hoje, proximos7Dias}`. `?responsavelId=` só para GESTOR/ADMIN (SDR: 403).',
  })
  @ApiQuery({ name: 'responsavelId', required: false })
  agenda(
    @Query(new ZodValidationPipe(agendaQuerySchema)) q: AgendaQuery,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.agenda(q.responsavelId, u);
  }

  @Get('contador')
  @ApiOperation({ summary: 'Contadores do menu: `{atrasadas, hoje}` do usuário logado.' })
  contador(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.contador(u);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista tarefas (padrão: do usuário logado; com `empresaJuniorId`, de todos os responsáveis).',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'responsavelId', required: false, description: 'Outro usuário: só GESTOR/ADMIN' })
  @ApiQuery({ name: 'empresaJuniorId', required: false })
  @ApiQuery({ name: 'concluida', required: false, type: Boolean })
  @ApiQuery({ name: 'origem', required: false, enum: ORIGENS_TAREFA })
  listar(
    @Query(new ZodValidationPipe(listarTarefasQuerySchema)) q: ListarTarefasQuery,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.listar(q, u);
  }

  @Post()
  @ApiOperation({ summary: 'Cria tarefa manual.' })
  @ApiBody({ type: TarefaDto })
  criar(
    @Body(new ZodValidationPipe(criarTarefaSchema)) body: CriarTarefaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.criar(body, u);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita título, descrição, vencimento ou responsável (este, só GESTOR/ADMIN).' })
  @ApiBody({ type: TarefaDto })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarTarefaSchema)) body: AtualizarTarefaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.atualizar(id, body, u);
  }

  @Patch(':id/concluir')
  @ApiOperation({ summary: 'Conclui a tarefa (idempotente). Responsável, criador, GESTOR ou ADMIN.' })
  concluir(@Param('id') id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.concluir(id, u);
  }

  @Patch(':id/reabrir')
  @ApiOperation({ summary: 'Reabre a tarefa concluída.' })
  reabrir(@Param('id') id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.reabrir(id, u);
  }

  @Post(':id/adiar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Adia a tarefa: `{novaData}` ou `{dias}` (a partir de max(vencimento, hoje)).' })
  @ApiBody({ type: AdiarDto })
  adiar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adiarTarefaSchema)) body: AdiarTarefaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.adiar(id, body, u);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Exclui a tarefa.' })
  excluir(@Param('id') id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.excluir(id, u);
  }
}
