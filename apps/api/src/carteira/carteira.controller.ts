import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { distribuirCarteiraSchema, type DistribuirCarteiraInput } from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CarteiraService } from './carteira.service';

class DistribuirDto {
  @ApiProperty({ enum: ['MANUAL', 'RODIZIO'] }) modo: 'MANUAL' | 'RODIZIO';
  @ApiPropertyOptional({ type: [String], description: 'MANUAL: EJs (máx. 5.000)' }) ejIds?: string[];
  @ApiPropertyOptional({ description: 'MANUAL: usuário que receberá as EJs' }) sdrId?: string;
  @ApiPropertyOptional({ type: [String], description: 'RODIZIO: usuários participantes' }) sdrIds?: string[];
  @ApiPropertyOptional({ description: 'RODIZIO: mesmos filtros da listagem (ex.: { uf: ["RS"] })' })
  filtros?: Record<string, unknown>;
  @ApiPropertyOptional({ default: true, description: 'RODIZIO: só EJs sem responsável' })
  apenasSemResponsavel?: boolean;
}

@ApiTags('carteira')
@ApiBearerAuth()
@Papeis('ADMIN', 'GESTOR')
@Controller('carteira')
export class CarteiraController {
  constructor(private readonly service: CarteiraService) {}

  @Post('distribuir')
  @ApiBody({ type: DistribuirDto })
  @ApiOperation({
    summary: 'Distribui EJs entre SDRs (ADMIN/GESTOR).',
    description:
      'MANUAL: atribui `ejIds` ao `sdrId`. RODIZIO: para cada UF, reparte as EJs entre `sdrIds` começando ' +
      'por quem tem menos EJs naquela UF. Retorna resumo por SDR (`atribuidas` e `porUf`). AuditLog por EJ.',
  })
  distribuir(
    @Body(new ZodValidationPipe(distribuirCarteiraSchema)) body: DistribuirCarteiraInput,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.service.distribuir(body, usuario);
  }
}
