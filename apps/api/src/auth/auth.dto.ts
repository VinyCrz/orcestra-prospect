import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@orcestra.com.br' }) email: string;
  @ApiProperty({ example: 'senha-segura' }) senha: string;
}

export class EsqueciSenhaDto {
  @ApiProperty({ example: 'admin@orcestra.com.br' }) email: string;
}

export class RedefinirSenhaDto {
  @ApiProperty() token: string;
  @ApiProperty({ minLength: 8 }) senha: string;
}

export class CadastroDto {
  @ApiProperty({ example: 'Maria Silva' }) nome: string;
  @ApiProperty({ example: 'maria@exemplo.com' }) email: string;
  @ApiProperty({ minLength: 10 }) senha: string;
  @ApiProperty({ description: 'Código da equipe, definido pelo ADMIN' }) codigo: string;
}

export class CodigoCadastroDto {
  @ApiProperty({ nullable: true, minLength: 8, description: 'null fecha o cadastro' })
  codigo: string | null;
}
