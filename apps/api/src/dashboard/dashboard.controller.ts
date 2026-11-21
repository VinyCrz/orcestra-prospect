import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { dashboardQuerySchema, type DashboardQuery } from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @ApiQuery({ name: 'inicio', required: false, description: 'AAAA-MM-DD ou ISO; padrão: 30 dias atrás' })
  @ApiQuery({ name: 'fim', required: false, description: 'AAAA-MM-DD (inclusivo) ou ISO; padrão: hoje. Máx. 366 dias' })
  @ApiQuery({ name: 'responsavelId', required: false, description: 'GESTOR/ADMIN; SDR sempre vê só o próprio' })
  @ApiOperation({ summary: 'Métricas do período agregadas no banco' })
  obter(
    @Query(new ZodValidationPipe(dashboardQuerySchema)) q: DashboardQuery,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.obter(q, u);
  }
}
