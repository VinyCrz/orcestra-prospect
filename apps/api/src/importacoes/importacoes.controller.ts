import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  iniciarImportacaoSchema,
  LIMITE_ARQUIVO_IMPORTACAO,
  listarImportacoesQuerySchema,
  mapeamentoImportacaoSchema,
  type ListarImportacoesQuery,
  type MapeamentoImportacaoInput,
} from '@orcestra/shared';
import type { Response } from 'express';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ImportacoesService } from './importacoes.service';

class UploadDto {
  @ApiProperty({ type: 'string', format: 'binary', description: '.csv (; ou , / UTF-8 ou latin1) ou .xlsx — máx. 10 MB' })
  arquivo: unknown;
  @ApiProperty({ enum: ['EJS', 'CONTATOS'] }) tipo: string;
}

class MapeamentoDto {
  @ApiProperty({
    description: '{ "Coluna do arquivo": "campoDoSistema" | null }. Campos válidos em `camposDisponiveis` do upload.',
    example: { 'Nome da EJ': 'nome', CNPJ: 'cnpj', Estado: 'uf', Obs: null },
  })
  mapeamento: Record<string, string | null>;
  @ApiPropertyOptional({
    enum: ['MESCLAR', 'IGNORAR'],
    default: 'IGNORAR',
    description: 'MESCLAR preenche só campos vazios (e une tags/serviços), nunca sobrescreve; IGNORAR pula duplicadas',
  })
  estrategiaDuplicados?: string;
}

/** Decisão: somente ADMIN e GESTOR importam (SDR não), pois importação altera a base compartilhada. */
@ApiTags('importacoes')
@ApiBearerAuth()
@Papeis('ADMIN', 'GESTOR')
@Controller('importacoes')
export class ImportacoesController {
  constructor(private readonly service: ImportacoesService) {}

  @Post()
  @ApiOperation({
    summary: '1/3 Envia o arquivo (multipart: `arquivo` + `tipo`).',
    description:
      'Retorna { id, colunas, amostra (10 linhas), mapeamentoSugerido, camposDisponiveis, avisoReenvio }. ' +
      'Fluxo: POST /importacoes -> PUT /importacoes/:id/mapeamento (pré-visualização) -> POST /importacoes/:id/processar.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadDto })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_ARQUIVO_IMPORTACAO, files: 1 } }))
  iniciar(
    @UploadedFile() arquivo: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Body(new ZodValidationPipe(iniciarImportacaoSchema)) body: { tipo: 'EJS' | 'CONTATOS' },
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.service.iniciar(arquivo, body.tipo, usuario);
  }

  @Put(':id/mapeamento')
  @ApiBody({ type: MapeamentoDto })
  @ApiOperation({
    summary: '2/3 Define o mapeamento + estratégia de duplicados e devolve a pré-visualização.',
    description:
      'Valida o mapeamento (400 com `erros[]`) e classifica TODAS as linhas: { novas, duplicadas, comErro, ' +
      'errosFrequentes, amostra (20 primeiras linhas normalizadas com status NOVA|DUPLICADA|ERRO) }. Não grava dados. ' +
      'Duplicidade: CNPJ, ou nome normalizado + IES + UF (contatos: e-mail ou nome dentro da mesma EJ).',
  })
  mapeamento(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mapeamentoImportacaoSchema)) body: MapeamentoImportacaoInput,
  ) {
    return this.service.definirMapeamento(id, body);
  }

  @Post(':id/processar')
  @ApiOperation({
    summary: '3/3 Enfileira o processamento (BullMQ, fila `importacoes`). Acompanhe com GET /importacoes/:id.',
    description: 'Idempotente: uma importação CONCLUIDA/PENDENTE/PROCESSANDO responde 409. FALHOU pode ser reenviada (retoma do checkpoint).',
  })
  processar(@Param('id') id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.service.processar(id, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Histórico paginado (sem o arquivo).' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  listar(@Query(new ZodValidationPipe(listarImportacoesQuerySchema)) q: ListarImportacoesQuery) {
    return this.service.listar(q);
  }

  @Get(':id/erros.csv')
  @ApiOperation({ summary: 'Relatório de erros em CSV (UTF-8 com BOM): linha, campo, erro + colunas originais.' })
  @ApiProduces('text/csv')
  async erros(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.service.errosCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="importacao-${id}-erros.csv"`);
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Progresso/detalhe: status, contadores, percentual, mapeamento e 50 primeiros erros.',
    description: 'Status: AGUARDANDO_MAPEAMENTO, PENDENTE, PROCESSANDO, CONCLUIDA, FALHOU, CANCELADA.',
  })
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }
}
