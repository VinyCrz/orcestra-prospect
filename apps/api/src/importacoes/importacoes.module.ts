import { Module } from '@nestjs/common';
import { FilasModule } from '../filas/filas.module';
import { ImportacoesController } from './importacoes.controller';
import { ImportacoesExecutor } from './importacoes.executor';
import { ImportacoesProcessor } from './importacoes.processor';
import { ImportacoesService } from './importacoes.service';

@Module({
  imports: [FilasModule],
  controllers: [ImportacoesController],
  providers: [ImportacoesService, ImportacoesExecutor, ImportacoesProcessor],
})
export class ImportacoesModule {}
