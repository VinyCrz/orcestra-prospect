import { Module } from '@nestjs/common';
import { ScoreModule } from '../score/score.module';
import { CadenciasController } from './cadencias.controller';
import { CadenciasService } from './cadencias.service';
import { MensagemPassoService } from './mensagem-passo.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [ScoreModule],
  controllers: [TemplatesController, CadenciasController],
  providers: [TemplatesService, CadenciasService, MensagemPassoService],
  exports: [MensagemPassoService],
})
export class CadenciasModule {}
