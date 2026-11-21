import { Module } from '@nestjs/common';
import { FunilController } from './funil.controller';
import { KanbanService } from './kanban.service';
import { StatusService } from './status.service';

@Module({
  controllers: [FunilController],
  providers: [StatusService, KanbanService],
  exports: [StatusService],
})
export class FunilModule {}
