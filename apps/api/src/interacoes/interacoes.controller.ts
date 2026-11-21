import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  atualizarInteracaoSchema,
  CANAIS_INTERACAO,
  criarInteracaoSchema,
  paginacaoSchema,
  RESULTADOS_INTERACAO,
  type AtualizarInteracaoInput,
  type CriarInteracaoInput,
  type PaginacaoInput,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InteracoesService } from './interacoes.service';
import { TimelineService } from './timeline.service';

class InteracaoDto {
  @ApiProperty({ enum: CANAIS_INTERACAO }) canal: string;
  @ApiPropertyOptional({ description: 'ISO ou AAAA-MM-DD; padrão agora' }) data?: string;
  @ApiPropertyOptional() contatoId?: string | null;
  @ApiProperty() resumo: string;
  @ApiProperty({ enum: RESULTADOS_INTERACAO }) resultado: string;
  @ApiPropertyOptional() proximoPasso?: string | null;
  @ApiPropertyOptional({ description: 'Se informada, cria Tarefa (origem INTERACAO) para o usuário' })
  proximoPassoData?: string | null;
}

const pag = [
  ApiQuery({ name: 'page', required: false, type: Number }),
  ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'máx. 100' }),
];
const aplicarPag: MethodDecorator = (t, k, d) => pag.forEach((x) => x(t, k, d));

@ApiTags('interacoes')
@ApiBearerAuth()
@Controller()
export class InteracoesController {
  constructor(
    private readonly service: InteracoesService,
    private readonly timeline: TimelineService,
  ) {}

  @Get('empresas-juniores/:id/interacoes')
  @aplicarPag
  @ApiOperation({ summary: 'Interações da EJ, mais recentes primeiro (paginado).' })
  listar(@Param('id') id: string, @Query(new ZodValidationPipe(paginacaoSchema)) q: PaginacaoInput) {
    return this.service.listar(id, q);
  }

  @Post('empresas-juniores/:id/interacoes')
  @ApiOperation({
    summary: 'Registra interação.',
    description:
      'SDR só registra nas EJs da própria carteira (403). Contato em opt-out/anonimizado: 422. Com `proximoPassoData` ' +
      'cria Tarefa (origem INTERACAO) para o usuário. A resposta traz `sugestaoStatus` ({de, para} ou null): se a EJ ' +
      'está em NAO_TRABALHADA/PESQUISADA sugere PRIMEIRO_CONTATO, mas o status NÃO é alterado automaticamente.',
  })
  @ApiBody({ type: InteracaoDto })
  @ApiForbiddenResponse({ description: 'SDR fora da carteira' })
  @ApiUnprocessableEntityResponse({ description: 'Contato em opt-out' })
  criar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(criarInteracaoSchema)) body: CriarInteracaoInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.criar(id, body, u);
  }

  @Patch('interacoes/:id')
  @ApiOperation({
    summary: 'Edita interação (autor, GESTOR ou ADMIN). Mantém a tarefa do próximo passo em sincronia.',
  })
  @ApiBody({ type: InteracaoDto })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarInteracaoSchema)) body: AtualizarInteracaoInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.atualizar(id, body, u);
  }

  @Delete('interacoes/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Exclui interação (autor, GESTOR ou ADMIN); remove a tarefa gerada se ainda pendente.',
  })
  excluir(@Param('id') id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.excluir(id, u);
  }

  @Get('empresas-juniores/:id/timeline')
  @aplicarPag
  @ApiOperation({
    summary: 'Linha do tempo unificada da EJ (mais recente primeiro, paginada).',
    description:
      'Eventos `{id, tipo, data, usuario, detalhes}`; tipo: INTERACAO, STATUS (HistoricoStatus), EDICAO (AuditLog da EJ), ' +
      'CONTATO (AuditLog de contatos, dados pessoais mascarados), TAREFA_CRIADA, TAREFA_CONCLUIDA. Observações editadas ' +
      'aparecem só como "alterado".',
  })
  linhaDoTempo(@Param('id') id: string, @Query(new ZodValidationPipe(paginacaoSchema)) q: PaginacaoInput) {
    return this.timeline.obter(id, q);
  }
}
