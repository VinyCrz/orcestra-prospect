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
  GAMIFICACAO: 'gamificacao',
} as const;

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        const db = Number(url.pathname.replace('/', '') || 0);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            db: Number.isFinite(db) ? db : 0,
            // rediss:// (Redis gerenciado com TLS) liga o TLS
            tls: url.protocol === 'rediss:' ? {} : undefined,
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
      { name: FILAS.GAMIFICACAO },
    ),
  ],
  exports: [BullModule],
})
export class FilasModule {}
