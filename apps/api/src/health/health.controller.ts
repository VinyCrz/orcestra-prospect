import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { FILAS } from '../filas/filas.module';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(FILAS.ENRIQUECIMENTO) private readonly fila: Queue,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Healthcheck (API, PostgreSQL e Redis)' })
  async check(@Res() res: Response) {
    const verificar = async (fn: () => Promise<unknown>) => {
      try {
        await Promise.race([
          fn(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);
        return 'ok' as const;
      } catch {
        return 'erro' as const;
      }
    };
    const [database, redis] = await Promise.all([
      verificar(() => this.prisma.$queryRaw`SELECT 1`),
      verificar(async () =>
        ((await this.fila.client) as unknown as { ping(): Promise<string> }).ping(),
      ),
    ]);
    const ok = database === 'ok' && redis === 'ok';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: ok ? 'ok' : 'degradado',
      servicos: { api: 'ok', database, redis },
      horario: new Date().toISOString(),
    });
  }
}
