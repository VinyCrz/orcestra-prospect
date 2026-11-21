import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { FILAS } from '../filas/filas.module';
import { ImportacoesExecutor } from './importacoes.executor';

export interface JobImportacao {
  importacaoId: string;
}

/** Worker da fila `importacoes` (roda no próprio processo da API). Concorrência 1: uma importação por vez. */
@Processor(FILAS.IMPORTACOES, { concurrency: 1 })
export class ImportacoesProcessor extends WorkerHost {
  private readonly log = new Logger(ImportacoesProcessor.name);

  constructor(private readonly executor: ImportacoesExecutor) {
    super();
  }

  async process(job: Job<JobImportacao>): Promise<void> {
    const { importacaoId } = job.data;
    try {
      await this.executor.executar(importacaoId);
    } catch (e) {
      const ultima = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.log.error(`Importação ${importacaoId} falhou (tentativa ${job.attemptsMade + 1}): ${(e as Error).message}`);
      if (ultima) await this.executor.marcarFalha(importacaoId, (e as Error).message);
      throw e;
    }
  }
}
