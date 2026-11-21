import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { FUSO } from '../common/fuso';
import { FILAS } from '../filas/filas.module';
import { AlertasService, type ResultadoAlertas } from './alertas.service';

export const CRON_ALERTAS = '0 6 * * *'; // todo dia às 06:00 (fuso America/Sao_Paulo)

/** Registra o job repetível (upsert: reiniciar a API não duplica o agendamento). */
@Injectable()
export class AlertasScheduler implements OnModuleInit {
  private readonly log = new Logger(AlertasScheduler.name);

  constructor(@InjectQueue(FILAS.ALERTAS) private readonly fila: Queue) {}

  async onModuleInit() {
    try {
      await this.fila.upsertJobScheduler(
        'alertas-diarios',
        { pattern: CRON_ALERTAS, tz: FUSO },
        { name: 'diario', opts: { removeOnComplete: 30, removeOnFail: 90, attempts: 3, backoff: { type: 'exponential', delay: 60_000 } } },
      );
    } catch (e) {
      this.log.error(`Falha ao agendar alertas diários: ${(e as Error).message}`);
    }
  }
}

@Processor(FILAS.ALERTAS, { concurrency: 1 })
export class AlertasProcessor extends WorkerHost {
  constructor(private readonly alertas: AlertasService) {
    super();
  }

  process(_job: Job): Promise<ResultadoAlertas> {
    return this.alertas.executar();
  }
}
