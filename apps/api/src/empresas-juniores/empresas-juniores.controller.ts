import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { listarEjsQuerySchema, STATUS_PROSPECCAO, type ListarEjsQuery } from '@orcestra/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EmpresasJunioresService } from './empresas-juniores.service';

@ApiTags('empresas-juniores')
@ApiBearerAuth()
@Controller('empresas-juniores')
export class EmpresasJunioresController {
  constructor(private readonly service: EmpresasJunioresService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada (server-side) de Empresas Juniores.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'busca', required: false, description: 'Busca por nome (ignora acentos)' })
  @ApiQuery({ name: 'uf', required: false, example: 'RS' })
  @ApiQuery({ name: 'federacaoId', required: false, description: 'ID da federação ou "nenhuma"' })
  @ApiQuery({ name: 'status', required: false, enum: STATUS_PROSPECCAO })
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['nome', 'uf', 'cidade', 'scoreIcp', 'atualizadoEm'],
  })
  @ApiQuery({ name: 'ordem', required: false, enum: ['asc', 'desc'] })
  listar(@Query(new ZodValidationPipe(listarEjsQuerySchema)) q: ListarEjsQuery) {
    return this.service.listar(q);
  }

  @Get('filtros')
  @ApiOperation({ summary: 'Valores disponíveis para filtros (UFs com contagem).' })
  filtros() {
    return this.service.filtros();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe (somente leitura) de uma Empresa Júnior.' })
  detalhar(@Param('id') id: string) {
    return this.service.detalhar(id);
  }
}
