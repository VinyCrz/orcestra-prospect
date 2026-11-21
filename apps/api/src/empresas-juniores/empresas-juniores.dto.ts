import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** DTOs apenas para documentação Swagger; a validação real usa os schemas Zod de @orcestra/shared. */
class IesRefDto {
  @ApiPropertyOptional({ description: 'ID de IES existente' }) id?: string;
  @ApiPropertyOptional({ description: 'Para criar/reutilizar por nome+uf' }) nome?: string;
  @ApiPropertyOptional() uf?: string;
}

class EjCamposDto {
  @ApiPropertyOptional() razaoSocial?: string | null;
  @ApiPropertyOptional({ description: '14 dígitos ou formatado; validado' }) cnpj?: string | null;
  @ApiPropertyOptional({ type: IesRefDto, nullable: true }) ies?: IesRefDto | null;
  @ApiPropertyOptional() federacaoId?: string | null;
  @ApiPropertyOptional() nucleoId?: string | null;
  @ApiPropertyOptional() cidade?: string | null;
  @ApiPropertyOptional({ example: 'RS' }) uf?: string | null;
  @ApiPropertyOptional({ description: 'Derivada da UF se omitida' }) regiao?: string | null;
  @ApiPropertyOptional({ type: [String] }) servicos?: string[];
  @ApiPropertyOptional() anoFundacao?: number | null;
  @ApiPropertyOptional() membrosEstimados?: number | null;
  @ApiPropertyOptional() federada?: boolean;
  @ApiPropertyOptional() site?: string | null;
  @ApiPropertyOptional() instagram?: string | null;
  @ApiPropertyOptional() linkedin?: string | null;
  @ApiPropertyOptional() facebook?: string | null;
  @ApiPropertyOptional() emailInstitucional?: string | null;
  @ApiPropertyOptional() telefoneInstitucional?: string | null;
  @ApiPropertyOptional() situacaoCadastral?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Substitui o conjunto de tags' }) tagIds?: string[];
  @ApiPropertyOptional({ description: 'Somente GESTOR/ADMIN podem alterar' }) responsavelId?: string | null;
  @ApiPropertyOptional() statusProspeccao?: string;
  @ApiPropertyOptional() observacoes?: string | null;
  @ApiPropertyOptional() verificado?: boolean;
}

export class CriarEjDto extends EjCamposDto {
  @ApiProperty() nome: string;
  @ApiPropertyOptional({ description: 'Padrão: "cadastro manual"' }) fonteUrl?: string;
}

export class AtualizarEjDto extends EjCamposDto {
  @ApiPropertyOptional() nome?: string;
}

export class AcaoEmMassaDto {
  @ApiPropertyOptional({ type: [String], description: 'ids OU filtros' }) ids?: string[];
  @ApiPropertyOptional({ description: 'Mesmos filtros da listagem (arrays), alternativa a ids' })
  filtros?: Record<string, unknown>;
  @ApiProperty({
    enum: ['ATRIBUIR_RESPONSAVEL', 'MUDAR_STATUS', 'ADICIONAR_TAG', 'REMOVER_TAG'],
  })
  acao: string;
  @ApiProperty({ nullable: true, description: 'id do usuário (ou null), status ou id da tag' })
  valor: string | null;
}
