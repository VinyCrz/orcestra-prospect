import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { retencaoQuerySchema, type RetencaoQuery } from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LgpdService } from './lgpd.service';

@ApiTags('lgpd')
@ApiBearerAuth()
@Papeis('ADMIN')
@Controller('lgpd')
export class LgpdController {
  constructor(private readonly service: LgpdService) {}

  @Get('retencao')
  @ApiOperation({
    summary:
      'Contatos candidatos à anonimização: mandato encerrado há mais de 24 meses e sem interação nos últimos 24 meses. Nada é apagado automaticamente.',
  })
  retencao(@Query(new ZodValidationPipe(retencaoQuerySchema)) q: RetencaoQuery) {
    return this.service.retencao(q);
  }

  @Post('supressao/backfill')
  @HttpCode(200)
  @ApiOperation({ summary: 'Idempotente: grava na lista de supressão todos os contatos com opt-out/anonimizados.' })
  backfill(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.backfillSupressao(u.id);
  }
}
