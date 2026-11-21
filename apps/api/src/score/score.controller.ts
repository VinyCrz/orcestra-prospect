import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  atualizarConfigScoreSchema,
  prioridadesQuerySchema,
  simulacaoScoreQuerySchema,
  type AtualizarConfigScoreInput,
  type PrioridadesQuery,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ScoreService } from './score.service';

@ApiTags('score')
@ApiBearerAuth()
@Controller('score')
export class ScoreController {
  constructor(private readonly service: ScoreService) {}

  @Get('config')
  @Papeis('ADMIN')
  @ApiOperation({ summary: 'Configuração do score: limiares, critérios (peso/ativo/parâmetros), versão e pendências de recálculo (ADMIN)' })
  obter() {
    return this.service.obterConfig();
  }

  @Put('config')
  @Papeis('ADMIN')
  @ApiOperation({
    summary: 'Atualiza critérios e limiares (ADMIN)',
    description:
      'Body: { limiares: {A,B,C}, criterios: [{ chave, peso, ativo, parametros }] }. Parâmetros validados por chave; soma dos ' +
      'pesos ativos > 0. Incrementa a versão, grava AuditLog e enfileira o recálculo (fila `score`).',
  })
  atualizar(
    @Body(new ZodValidationPipe(atualizarConfigScoreSchema)) body: AtualizarConfigScoreInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.atualizarConfig(body, u);
  }

  @Post('recalcular')
  @Papeis('ADMIN')
  @HttpCode(202)
  @ApiOperation({ summary: 'Enfileira o recálculo forçado de todas as EJs (ADMIN)' })
  recalcular(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.solicitarRecalculo(u);
  }

  @Get('simulacao')
  @ApiQuery({ name: 'ejId', required: false })
  @ApiOperation({
    summary: 'Simulação com a configuração atual, sem gravar',
    description: 'Com `ejId`: score, faixa e detalhe da EJ. Sem: distribuição de EJs por faixa.',
  })
  simular(@Query(new ZodValidationPipe(simulacaoScoreQuerySchema)) q: { ejId?: string }) {
    return this.service.simular(q.ejId);
  }
}

@ApiTags('score')
@ApiBearerAuth()
@Controller('prioridades-da-semana')
export class PrioridadesController {
  constructor(private readonly service: ScoreService) {}

  @Get()
  @ApiQuery({ name: 'responsavelId', required: false, description: 'GESTOR/ADMIN; SDR sempre vê a própria carteira' })
  @ApiQuery({ name: 'limite', required: false, type: Number, description: 'padrão 10, máx. 50' })
  @ApiQuery({ name: 'incluirPesquisadas', required: false, type: Boolean })
  @ApiOperation({ summary: 'Top EJs da carteira ainda não trabalhadas, por score decrescente' })
  listar(
    @Query(new ZodValidationPipe(prioridadesQuerySchema)) q: PrioridadesQuery,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.prioridades(q, u);
  }
}
