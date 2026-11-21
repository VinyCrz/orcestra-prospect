import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Nomes das filas que serão usadas nas próximas etapas (enriquecimento, cadências, importações). */
export const FILAS = {
  ENRIQUECIMENTO: 'enriquecimento',
  CADENCIAS: 'cadencias',
  IMPORTACOES: 'importacoes',
  ALERTAS: 'alertas',
  SCORE: 'score',
} as const;

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            maxRetriesPerRequest: null,
          },
          prefix: 'orcestra',
        };
      },
    }),
    BullModule.registerQueue(
      { name: FILAS.ENRIQUECIMENTO },
      { name: FILAS.CADENCIAS },
      { name: FILAS.IMPORTACOES },
      { name: FILAS.ALERTAS },
      { name: FILAS.SCORE },
    ),
  ],
  exports: [BullModule],
})
export class FilasModule {}
