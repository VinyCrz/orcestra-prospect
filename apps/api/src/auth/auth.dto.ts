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
