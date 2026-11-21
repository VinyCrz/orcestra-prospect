import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  atualizarListaSalvaSchema,
  listaSalvaSchema,
  type AtualizarListaSalvaInput,
  type ListaSalvaInput,
} from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ListasSalvasService } from './listas-salvas.service';

class ListaSalvaDto {
  @ApiProperty() nome: string;
  @ApiPropertyOptional() descricao?: string | null;
  @ApiProperty({
    description:
      'Mesmos filtros de GET /empresas-juniores (uf[], regiao[], federacaoId[], iesId[], tagIds[], membrosMin, membrosMax, federada, status[], scoreMin, scoreMax, responsavelId[] ("eu"/"nenhum"), busca)',
    example: { uf: ['RS', 'SC'], status: ['NAO_TRABALHADA'], responsavelId: ['nenhum'] },
  })
  filtros: Record<string, unknown>;
  @ApiPropertyOptional({ default: false, description: 'Visível para o time' }) compartilhada?: boolean;
}

@ApiTags('listas-salvas')
@ApiBearerAuth()
@Controller('listas-salvas')
export class ListasSalvasController {
  constructor(private readonly service: ListasSalvasService) {}

  @Get()
  @ApiOperation({ summary: 'Minhas listas + listas compartilhadas do time (`minha`, `podeEditar`).' })
  listar(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.listar(u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma lista (própria ou compartilhada).' })
  obter(@Param('id') id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.obter(id, u);
  }

  @Post()
  @ApiBody({ type: ListaSalvaDto })
  @ApiOperation({ summary: 'Cria lista salva (filtros validados pelo schema de filtros).' })
  criar(
    @Body(new ZodValidationPipe(listaSalvaSchema)) body: ListaSalvaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.criar(body, u);
  }

  @Patch(':id')
  @ApiBody({ type: ListaSalvaDto })
  @ApiOperation({ summary: 'Edita lista (somente o dono ou ADMIN; 403 caso contrário).' })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarListaSalvaSchema)) body: AtualizarListaSalvaInput,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.service.atualizar(id, body, u);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui lista (somente o dono ou ADMIN).' })
  excluir(@Param('id') id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.excluir(id, u);
  }
}
