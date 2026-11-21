import { Module } from '@nestjs/common';
import { CadenciasModule } from '../cadencias/cadencias.module';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';

@Module({ imports: [CadenciasModule], controllers: [TarefasController], providers: [TarefasService] })
export class TarefasModule {}
