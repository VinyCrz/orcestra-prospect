import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { auditLogsQuerySchema, type AuditLogsQuery } from '@orcestra/shared';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Papeis('ADMIN')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista o AuditLog (ADMIN) com filtros e paginação (pageSize ≤ 100).' })
  listar(@Query(new ZodValidationPipe(auditLogsQuerySchema)) q: AuditLogsQuery) {
    return this.service.listar(q);
  }

  @Get('acoes')
  @ApiOperation({ summary: 'Lista distinta de ações registradas (para o filtro).' })
  acoes() {
    return this.service.acoes();
  }
}
