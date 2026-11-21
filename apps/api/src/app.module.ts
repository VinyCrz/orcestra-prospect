import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './common/audit.service';
import { CarteiraModule } from './carteira/carteira.module';
import { AlertasModule } from './alertas/alertas.module';
import { ScoreModule } from './score/score.module';
import { FunilModule } from './funil/funil.module';
import { InteracoesModule } from './interacoes/interacoes.module';
import { MotivosPerdaModule } from './motivos-perda/motivos-perda.module';
import { TarefasModule } from './tarefas/tarefas.module';
import { ContatosModule } from './contatos/contatos.module';
import { ImportacoesModule } from './importacoes/importacoes.module';
import { ListasSalvasModule } from './listas-salvas/listas-salvas.module';
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
    AuditModule,
    FilasModule,
    AuthModule,
    HealthModule,
    UsuariosModule,
    FederacoesModule,
    EmpresasJunioresModule,
    ListasSalvasModule,
    CarteiraModule,
    ContatosModule,
    ImportacoesModule,
    FunilModule,
    MotivosPerdaModule,
    InteracoesModule,
    TarefasModule,
    AlertasModule,
    ScoreModule,
  ],
})
export class AppModule {}
