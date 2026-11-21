import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriarUsuarioDto {
  @ApiProperty() nome: string;
  @ApiProperty() email: string;
  @ApiProperty({ minLength: 8 }) senha: string;
  @ApiProperty({ enum: ['ADMIN', 'GESTOR', 'SDR'] }) papel: 'ADMIN' | 'GESTOR' | 'SDR';
}

export class AtualizarUsuarioDto {
  @ApiPropertyOptional() nome?: string;
  @ApiPropertyOptional({ enum: ['ADMIN', 'GESTOR', 'SDR'] }) papel?: 'ADMIN' | 'GESTOR' | 'SDR';
  @ApiPropertyOptional() ativo?: boolean;
}
