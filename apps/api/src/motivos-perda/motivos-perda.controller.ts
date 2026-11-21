import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  atualizarMotivoPerdaSchema,
  criarMotivoPerdaSchema,
  listarMotivosQuerySchema,
  type AtualizarMotivoPerdaInput,
  type CriarMotivoPerdaInput,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MotivosPerdaService } from './motivos-perda.service';

class MotivoDto {
  @ApiProperty() nome: string;
  @ApiPropertyOptional() ordem?: number;
}
class AtualizarMotivoDto {
  @ApiPropertyOptional() nome?: string;
  @ApiPropertyOptional() ordem?: number;
  @ApiPropertyOptional({ description: 'false desativa (não há exclusão: o motivo pode estar em uso)' })
  ativo?: boolean;
}

@ApiTags('motivos-perda')
@ApiBearerAuth()
@Controller('motivos-perda')
export class MotivosPerdaController {
  constructor(private readonly service: MotivosPerdaService) {}

  @Get()
  @ApiOperation({ summary: 'Lista motivos de perda (por padrão só os ativos), ordenados.' })
  @ApiQuery({ name: 'incluirInativos', required: false, type: Boolean })
  listar(@Query(new ZodValidationPipe(listarMotivosQuerySchema)) q: { incluirInativos: boolean }) {
    return this.service.listar(q.incluirInativos);
  }

  @Post()
  @Papeis('ADMIN')
  @ApiOperation({ summary: 'Cria motivo de perda (ADMIN).' })
  @ApiBody({ type: MotivoDto })
  @ApiConflictResponse({ description: 'Nome já existe' })
  criar(
    @Body(new ZodValidationPipe(criarMotivoPerdaSchema)) body: CriarMotivoPerdaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.criar(body, u);
  }

  @Patch(':id')
  @Papeis('ADMIN')
  @ApiOperation({ summary: 'Renomeia, reordena ou (des)ativa um motivo (ADMIN). Não existe DELETE.' })
  @ApiBody({ type: AtualizarMotivoDto })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarMotivoPerdaSchema)) body: AtualizarMotivoPerdaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.atualizar(id, body, u);
  }
}
