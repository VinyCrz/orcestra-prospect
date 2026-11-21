import { Module } from '@nestjs/common';
import { EmpresasJunioresController } from './empresas-juniores.controller';
import { EmpresasJunioresService } from './empresas-juniores.service';

@Module({ controllers: [EmpresasJunioresController], providers: [EmpresasJunioresService] })
export class EmpresasJunioresModule {}
