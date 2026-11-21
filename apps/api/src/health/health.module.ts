import { Module } from '@nestjs/common';
import { FilasModule } from '../filas/filas.module';
import { HealthController } from './health.controller';

@Module({ imports: [FilasModule], controllers: [HealthController] })
export class HealthModule {}
