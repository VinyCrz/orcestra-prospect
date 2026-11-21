import { Module } from '@nestjs/common';
import { FilasModule } from '../filas/filas.module';
import { PrioridadesController, ScoreController } from './score.controller';
import { ScoreProcessor } from './score.processor';
import { ScoreService } from './score.service';

@Module({
  imports: [FilasModule],
  controllers: [ScoreController, PrioridadesController],
  providers: [ScoreService, ScoreProcessor],
  exports: [ScoreService],
})
export class ScoreModule {}
