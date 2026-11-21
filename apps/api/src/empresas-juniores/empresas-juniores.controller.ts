import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  acaoEmMassaSchema,
  atualizarEjSchema,
  criarEjSchema,
  exportarEjsQuerySchema,
  opcoesIesQuerySchema,
  type OpcoesIesQuery,
  listarEjsQuerySchema,
  ORDENAR_EJS,
  STATUS_PROSPECCAO,
  type AcaoEmMassaInput,
  type AtualizarEjInput,
  type CriarEjInput,
  type ExportarEjsQuery,
  type ListarEjsQuery,
} from '@orcestra/shared';
import type { Response } from 'express';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { BOM, linhaCsv } from '../common/csv';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AcoesEmMassaService } from './acoes-em-massa.service';
import { AcaoEmMassaDto, AtualizarEjDto, CriarEjDto } from './empresas-juniores.dto';
import { EmpresasJunioresService } from './empresas-juniores.service';

const FILTROS_DOC = [
  { name: 'busca', description: 'Nome, razão social ou CNPJ (ignora acentos)' },
  { name: 'uf', description: 'Multi: `RS,SC` ou `uf=RS&uf=SC`' },
  { name: 'regiao', description: 'Multi: NORTE, NORDESTE, CENTRO_OESTE, SUDESTE, SUL' },
  { name: 'federacaoId', description: 'Multi: ids e/ou `nenhuma` (sem federação)' },
  { name: 'iesId', description: 'Multi: ids de IES' },
  { name: 'tagIds', description: 'Multi: EJ com QUALQUER uma das tags (área/curso/livre)' },
  { name: 'membrosMin', type: Number },
  { name: 'membrosMax', type: Number },
  { name: 'federada', type: Boolean },
  { name: 'status', description: `Multi: ${STATUS_PROSPECCAO.join(', ')}` },
  { name: 'scoreMin', type: Number },
  { name: 'scoreMax', type: Number },
  { name: 'responsavelId', description: 'Multi: ids, `nenhum` (sem responsável) e/ou `eu`' },
];
const docFiltros = () =>
  FILTROS_DOC.map((f) => ApiQuery({ required: false, ...f }) as MethodDecorator);
function aplicar(...ds: MethodDecorator[]): MethodDecorator {
  return (t, k, d) => ds.forEach((x) => x(t, k, d));
}

@ApiTags('empresas-juniores')
@ApiBearerAuth()
@Controller('empresas-juniores')
export class EmpresasJunioresController {
  constructor(
    private readonly service: EmpresasJunioresService,
    private readonly massa: AcoesEmMassaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista paginada (server-side) com filtros combináveis (AND entre filtros).',
    description:
      'Cada item inclui `responsavel`, `tags` e `podeEditar` (true se o usuário logado pode editar a EJ). ' +
      'Filtros multi aceitam valores separados por vírgula ou parâmetro repetido.',
  })
  @aplicar(
    ...docFiltros(),
    ApiQuery({ name: 'page', required: false, type: Number }),
    ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'máx. 100' }),
    ApiQuery({ name: 'ordenarPor', required: false, enum: ORDENAR_EJS }),
    ApiQuery({ name: 'ordem', required: false, enum: ['asc', 'desc'] }),
  )
  listar(
    @Query(new ZodValidationPipe(listarEjsQuerySchema)) q: ListarEjsQuery,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.service.listar(q, usuario);
  }

  @Get('filtros')
  @ApiOperation({ summary: 'Valores disponíveis para filtros (UFs e regiões com contagem).' })
  filtros() {
    return this.service.filtros();
  }

  @Get('opcoes/ies')
  @ApiOperation({ summary: 'Opções do filtro IES, com contagem de EJs (top 200; use `busca`).' })
  @ApiQuery({ name: 'busca', required: false })
  @ApiQuery({ name: 'uf', required: false })
  opcoesIes(@Query(new ZodValidationPipe(opcoesIesQuerySchema)) q: OpcoesIesQuery) {
    return this.service.opcoesIes(q.busca || undefined, q.uf || undefined);
  }

  @Get('opcoes/tags')
  @ApiOperation({ summary: 'Tags (área/curso/livre) com contagem de EJs.' })
  opcoesTags() {
    return this.service.opcoesTags();
  }

  @Get('opcoes/responsaveis')
  @ApiOperation({
    summary: 'Usuários ativos (SDR/GESTOR/ADMIN) com tamanho da carteira + total sem responsável.',
  })
  opcoesResponsaveis() {
    return this.service.opcoesResponsaveis();
  }

  @Get('exportar.csv')
  @ApiOperation({
    summary: 'Exporta em CSV (UTF-8 com BOM, separador `;`) com os mesmos filtros/ordenação da lista.',
  })
  @ApiProduces('text/csv')
  @aplicar(
    ...docFiltros(),
    ApiQuery({ name: 'ordenarPor', required: false, enum: ORDENAR_EJS }),
    ApiQuery({ name: 'ordem', required: false, enum: ['asc', 'desc'] }),
  )
  async exportar(
    @Query(new ZodValidationPipe(exportarEjsQuerySchema)) q: ExportarEjsQuery,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="empresas-juniores-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.write(
      BOM +
        linhaCsv([
          'Nome',
          'CNPJ',
          'IES',
          'UF',
          'Cidade',
          'Região',
          'Federação',
          'Federada',
          'Membros',
          'Status',
          'Score ICP',
          'Responsável',
          'Tags',
          'Site',
          'Instagram',
          'E-mail institucional',
          'Telefone institucional',
        ]),
    );
    try {
      for await (const lote of this.service.iterar(q, usuario)) {
        res.write(
          lote
            .map((e) =>
              linhaCsv([
                e.nome,
                e.cnpj,
                e.ies?.nome,
                e.uf,
                e.cidade,
                e.regiao,
                e.federacao?.sigla ?? e.federacao?.nome,
                e.federada ? 'Sim' : 'Não',
                e.membrosEstimados,
                e.statusProspeccao,
                e.scoreIcp,
                e.responsavel?.nome,
                e.tags.map((t) => t.nome).join(', '),
                e.site,
                e.instagram,
                e.emailInstitucional,
                e.telefoneInstitucional,
              ]),
            )
            .join(''),
        );
      }
    } finally {
      res.end();
    }
  }

  @Post('acoes-em-massa')
  @ApiOperation({
    summary: 'Ação em massa sobre EJs selecionadas por `ids` OU por `filtros` (máx. 5.000).',
    description:
      'acao: ATRIBUIR_RESPONSAVEL (valor = id do usuário ou null; só GESTOR/ADMIN), MUDAR_STATUS (valor = status), ' +
      'ADICIONAR_TAG / REMOVER_TAG (valor = id da tag). SDR só afeta EJs da sua carteira; as demais são ' +
      'contadas em `semPermissao`. Transacional, com AuditLog por EJ alterada.',
  })
  @ApiBody({ type: AcaoEmMassaDto })
  acoesEmMassa(
    @Body(new ZodValidationPipe(acaoEmMassaSchema)) body: AcaoEmMassaInput,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.massa.executar(body, usuario);
  }

  @Post()
  @ApiOperation({
    summary: 'Cadastro manual de EJ.',
    description:
      'chaveDedupe/nomeNormalizado calculados no servidor. `fonteUrl` padrão "cadastro manual"; coletadoEm = agora. ' +
      'SDR cria a EJ já atribuída a si.',
  })
  @ApiBody({ type: CriarEjDto })
  @ApiConflictResponse({ description: 'EJ duplicada. Corpo: { existenteId, existenteNome }' })
  criar(
    @Body(new ZodValidationPipe(criarEjSchema)) body: CriarEjInput,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.service.criar(body, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma EJ (inclui `podeEditar`).' })
  detalhar(@Param('id') id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.service.detalhar(id, usuario);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita qualquer campo da EJ (parcial). Campos omitidos não mudam; null limpa.',
    description:
      'SDR só edita EJ com responsavelId = ele (403) e não pode alterar o responsável. ' +
      'AuditLog grava {antes, depois} apenas dos campos alterados.',
  })
  @ApiBody({ type: AtualizarEjDto })
  @ApiForbiddenResponse({ description: 'SDR fora da carteira' })
  @ApiConflictResponse({ description: 'Alteração geraria duplicidade (CNPJ ou nome+IES+UF)' })
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarEjSchema)) body: AtualizarEjInput,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.service.atualizar(id, body, usuario);
  }
}
