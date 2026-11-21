import { Module } from '@nestjs/common';
import { AcoesEmMassaService } from './acoes-em-massa.service';
import { EmpresasJunioresController } from './empresas-juniores.controller';
import { EmpresasJunioresService } from './empresas-juniores.service';

@Module({
  controllers: [EmpresasJunioresController],
  providers: [EmpresasJunioresService, AcoesEmMassaService],
  exports: [EmpresasJunioresService],
})
export class EmpresasJunioresModule {}
