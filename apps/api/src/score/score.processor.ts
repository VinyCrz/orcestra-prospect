import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { FILAS } from '../filas/filas.module';
import { ScoreService, type JobScore } from './score.service';

/** Worker da fila `score`. Concorrência 1: um recálculo em massa por vez. */
@Processor(FILAS.SCORE, { concurrency: 1 })
export class ScoreProcessor extends WorkerHost {
  constructor(private readonly score: ScoreService) {
    super();
  }

  process(job: Job<JobScore>) {
    return this.score.recalcularEmMassa(!!job.data?.forcar);
  }
}
