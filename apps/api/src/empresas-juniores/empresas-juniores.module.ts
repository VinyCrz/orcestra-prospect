import { Module } from '@nestjs/common';
import { ScoreModule } from '../score/score.module';
import { FunilModule } from '../funil/funil.module';
import { AcoesEmMassaService } from './acoes-em-massa.service';
import { EmpresasJunioresController } from './empresas-juniores.controller';
import { EmpresasJunioresService } from './empresas-juniores.service';

@Module({
  imports: [FunilModule, ScoreModule],
  controllers: [EmpresasJunioresController],
  providers: [EmpresasJunioresService, AcoesEmMassaService],
  exports: [EmpresasJunioresService],
})
export class EmpresasJunioresModule {}
