import { Module } from '@nestjs/common';
import { ScoreModule } from '../score/score.module';
import { ContatosController } from './contatos.controller';
import { ContatosService } from './contatos.service';

@Module({ imports: [ScoreModule], controllers: [ContatosController], providers: [ContatosService] })
export class ContatosModule {}
