import { Module } from '@nestjs/common';
import { FilasModule } from '../filas/filas.module';
import { AlertasController } from './alertas.controller';
import { AlertasProcessor, AlertasScheduler } from './alertas.scheduler';
import { AlertasService } from './alertas.service';

@Module({
  imports: [FilasModule],
  controllers: [AlertasController],
  providers: [AlertasService, AlertasScheduler, AlertasProcessor],
  exports: [AlertasService],
})
export class AlertasModule {}
