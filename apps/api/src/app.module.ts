import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validarEnv } from './config/env';
import { EmpresasJunioresModule } from './empresas-juniores/empresas-juniores.module';
import { FederacoesModule } from './federacoes/federacoes.module';
import { FilasModule } from './filas/filas.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validarEnv,
    }),
    PrismaModule,
    FilasModule,
    AuthModule,
    HealthModule,
    UsuariosModule,
    FederacoesModule,
    EmpresasJunioresModule,
  ],
})
export class AppModule {}
