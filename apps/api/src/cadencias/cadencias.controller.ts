import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  atualizarCadenciaSchema,
  criarCadenciaSchema,
  encerrarInscricaoSchema,
  inscreverSchema,
  listarCadenciasQuerySchema,
  listarInscricoesQuerySchema,
  type AtualizarCadenciaInput,
  type CriarCadenciaInput,
  type EncerrarInscricaoInput,
  type InscreverInput,
  type ListarCadenciasQuery,
  type ListarInscricoesQuery,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CadenciasService } from './cadencias.service';

@ApiTags('cadencias')
@ApiBearerAuth()
@Controller()
export class CadenciasController {
  constructor(private readonly service: CadenciasService) {}

  @Get('cadencias')
  @ApiOperation({ summary: 'Lista cadências com passos e nº de inscrições ativas (todos os papéis).' })
  listar(@Query(new ZodValidationPipe(listarCadenciasQuerySchema)) q: ListarCadenciasQuery) {
    return this.service.listar(q);
  }

  @Get('cadencias/:id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Post('cadencias')
  @Papeis('ADMIN')
  @ApiOperation({ summary: 'Cria cadência global (ADMIN). Passos: {diaOffset, canal, templateId?, instrucoes?}; canal do template = canal do passo.' })
  criar(
    @Body(new ZodValidationPipe(criarCadenciaSchema)) body: CriarCadenciaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.criar(body, u);
  }

  @Patch('cadencias/:id')
  @Papeis('ADMIN')
  @ApiOperation({ summary: 'Edita/desativa (`ativa:false`) a cadência (ADMIN). `passos` substitui a lista.' })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarCadenciaSchema)) body: AtualizarCadenciaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.atualizar(id, body, u);
  }

  @Post('cadencias/:id/inscrever')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Inscreve EJs (até 500) e gera as tarefas dos passos. SDR: só EJs da própria carteira.',
    description: 'Resposta: `{inscritas, ignoradas:[{ejId, motivo}]}`.',
  })
  inscrever(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(inscreverSchema)) body: InscreverInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.inscrever(id, body, u);
  }

  @Get('cadencias/:id/inscricoes')
  @ApiOperation({ summary: 'Inscrições da cadência (paginado; ?status=ATIVA|CONCLUIDA|ENCERRADA).' })
  inscricoesDaCadencia(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(listarInscricoesQuerySchema)) q: ListarInscricoesQuery,
  ) {
    return this.service.inscricoesDaCadencia(id, q);
  }

  @Get('empresas-juniores/:id/inscricoes')
  @ApiOperation({ summary: 'Inscrições da EJ (com progresso dos passos).' })
  inscricoesDaEj(@Param('id') id: string) {
    return this.service.inscricoesDaEj(id);
  }

  @Post('inscricoes/:id/encerrar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Encerra manualmente (cancela tarefas pendentes). SDR: só EJs da carteira.' })
  encerrar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(encerrarInscricaoSchema)) body: EncerrarInscricaoInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.encerrar(id, body, u);
  }
}
