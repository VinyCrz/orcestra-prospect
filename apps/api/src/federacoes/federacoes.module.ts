import { Module } from '@nestjs/common';
import { FederacoesController } from './federacoes.controller';

@Module({ controllers: [FederacoesController] })
export class FederacoesModule {}
