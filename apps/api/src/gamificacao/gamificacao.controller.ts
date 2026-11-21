import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  avaliarSemanaQuerySchema,
  conquistasQuerySchema,
  metaInputSchema,
  semanaQuerySchema,
  type AvaliarSemanaQuery,
  type ConquistasQuery,
  type MetaInput,
  type SemanaQuery,
} from '@orcestra/shared';
import type { Queue } from 'bullmq';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { semanaAnterior, segundaDaSemanaIso } from '../common/semana';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FILAS } from '../filas/filas.module';
import { GamificacaoService } from './gamificacao.service';
import { MetasService } from './metas.service';

@ApiTags('gamificacao')
@ApiBearerAuth()
@Controller('gamificacao')
export class GamificacaoController {
  constructor(
    private readonly service: GamificacaoService,
    @InjectQueue(FILAS.GAMIFICACAO) private readonly fila: Queue,
  ) {}

  @Get('semana')
  @ApiOperation({ summary: 'Progresso da meta na semana ISO (padrão: atual); SDR sempre o próprio' })
  semana(@Query(new ZodValidationPipe(semanaQuerySchema)) q: SemanaQuery, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.semana(q, u);
  }

  @Get('ranking')
  @ApiOperation({ summary: 'Ranking semanal dos SDRs ativos (pontos = interações + 5 × reuniões)' })
  ranking(@Query(new ZodValidationPipe(avaliarSemanaQuerySchema)) q: AvaliarSemanaQuery) {
    segundaDaSemanaIso(q.semana ?? '2000-W01');
    return this.service.ranking(q.semana);
  }

  @Get('conquistas')
  @ApiOperation({ summary: 'Catálogo de conquistas com status do usuário (SDR: só as próprias)' })
  conquistas(@Query(new ZodValidationPipe(conquistasQuerySchema)) q: ConquistasQuery, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.conquistas(q, u);
  }

  @Post('avaliar-semana')
  @Papeis('ADMIN')
  @HttpCode(202)
  @ApiOperation({ summary: 'Enfileira a avaliação de SEMANA_META_BATIDA (padrão: semana anterior); idempotente' })
  async avaliar(@Query(new ZodValidationPipe(avaliarSemanaQuerySchema)) q: AvaliarSemanaQuery) {
    const semana = q.semana ?? semanaAnterior(new Date());
    segundaDaSemanaIso(semana);
    await this.fila.add('avaliar-semana', { semana }, { removeOnComplete: 30, removeOnFail: 90, attempts: 3, backoff: { type: 'exponential', delay: 60_000 } });
    return { semana, enfileirado: true };
  }
}

@ApiTags('gamificacao')
@ApiBearerAuth()
@Controller('metas')
export class MetasController {
  constructor(private readonly service: MetasService) {}

  @Get()
  @ApiOperation({ summary: 'ADMIN: global + overrides (com histórico); demais: meta vigente do usuário' })
  obter(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.obter(u);
  }

  @Put('global')
  @Papeis('ADMIN')
  @ApiOperation({ summary: 'Define a meta global (versionada por vigenteDesde = segunda-feira; padrão: semana atual)' })
  global(@Body(new ZodValidationPipe(metaInputSchema)) b: MetaInput, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.definirGlobal(b, u);
  }

  @Put('usuarios/:id')
  @Papeis('ADMIN')
  @ApiOperation({ summary: 'Define o override de meta de um SDR' })
  usuario(@Param('id') id: string, @Body(new ZodValidationPipe(metaInputSchema)) b: MetaInput, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.definirUsuario(id, b, u);
  }

  @Delete('usuarios/:id')
  @Papeis('ADMIN')
  @ApiOperation({ summary: 'Remove os overrides do SDR (volta à meta global)' })
  remover(@Param('id') id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.removerOverride(id, u);
  }
}
