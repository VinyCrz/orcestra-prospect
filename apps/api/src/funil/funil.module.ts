import { Module } from '@nestjs/common';
import { FunilController } from './funil.controller';
import { GamificacaoModule } from '../gamificacao/gamificacao.module';
import { KanbanService } from './kanban.service';
import { StatusService } from './status.service';

@Module({
  imports: [GamificacaoModule],
  controllers: [FunilController],
  providers: [StatusService, KanbanService],
  exports: [StatusService],
})
export class FunilModule {}
