import { Module } from '@nestjs/common';
import { MotivosPerdaController } from './motivos-perda.controller';
import { MotivosPerdaService } from './motivos-perda.service';

@Module({ controllers: [MotivosPerdaController], providers: [MotivosPerdaService] })
export class MotivosPerdaModule {}
