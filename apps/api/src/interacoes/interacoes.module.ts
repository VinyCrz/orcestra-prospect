import { Module } from '@nestjs/common';
import { ScoreModule } from '../score/score.module';
import { InteracoesController } from './interacoes.controller';
import { InteracoesService } from './interacoes.service';
import { TimelineService } from './timeline.service';

@Module({
  imports: [ScoreModule],
  controllers: [InteracoesController],
  providers: [InteracoesService, TimelineService],
})
export class InteracoesModule {}
