import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { FUSO } from '../common/fuso';
import { semanaAnterior } from '../common/semana';
import { FILAS } from '../filas/filas.module';
import { ConquistasService } from './conquistas.service';

export const CRON_GAMIFICACAO = '0 3 * * 1'; // segunda 03:00 (America/Sao_Paulo), avalia a semana anterior

@Injectable()
export class GamificacaoScheduler implements OnModuleInit {
  private readonly log = new Logger(GamificacaoScheduler.name);

  constructor(@InjectQueue(FILAS.GAMIFICACAO) private readonly fila: Queue) {}

  async onModuleInit() {
    try {
      await this.fila.upsertJobScheduler(
        'gamificacao-semanal',
        { pattern: CRON_GAMIFICACAO, tz: FUSO },
        { name: 'avaliar-semana', opts: { removeOnComplete: 30, removeOnFail: 90, attempts: 3, backoff: { type: 'exponential', delay: 60_000 } } },
      );
    } catch (e) {
      this.log.error(`Falha ao agendar a avaliação semanal: ${(e as Error).message}`);
    }
  }
}

/** Idempotente: reexecutar a mesma semana não duplica (ON CONFLICT DO NOTHING). */
@Processor(FILAS.GAMIFICACAO, { concurrency: 1 })
export class GamificacaoProcessor extends WorkerHost {
  constructor(private readonly conquistas: ConquistasService) {
    super();
  }

  process(job: Job<{ semana?: string } | undefined>) {
    return this.conquistas.avaliarSemana(job.data?.semana ?? semanaAnterior(new Date()));
  }
}
