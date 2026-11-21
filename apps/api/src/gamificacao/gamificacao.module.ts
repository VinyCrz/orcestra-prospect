import { Module } from '@nestjs/common';
import { FilasModule } from '../filas/filas.module';
import { ConquistasService } from './conquistas.service';
import { GamificacaoController, MetasController } from './gamificacao.controller';
import { GamificacaoProcessor, GamificacaoScheduler } from './gamificacao.scheduler';
import { GamificacaoService } from './gamificacao.service';
import { MetasService } from './metas.service';

@Module({
  imports: [FilasModule],
  controllers: [GamificacaoController, MetasController],
  providers: [GamificacaoService, MetasService, ConquistasService, GamificacaoScheduler, GamificacaoProcessor],
  exports: [ConquistasService],
})
export class GamificacaoModule {}
