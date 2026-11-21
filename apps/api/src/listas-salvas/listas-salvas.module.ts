import { Module } from '@nestjs/common';
import { ListasSalvasController } from './listas-salvas.controller';
import { ListasSalvasService } from './listas-salvas.service';

@Module({ controllers: [ListasSalvasController], providers: [ListasSalvasService] })
export class ListasSalvasModule {}
