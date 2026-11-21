-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'GESTOR', 'SDR');

-- CreateEnum
CREATE TYPE "Regiao" AS ENUM ('NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL');

-- CreateEnum
CREATE TYPE "StatusProspeccao" AS ENUM ('NAO_TRABALHADA', 'EM_PROSPECCAO', 'CONTATO_REALIZADO', 'REUNIAO_AGENDADA', 'PROPOSTA_ENVIADA', 'NEGOCIACAO', 'GANHA', 'PERDIDA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "TipoTag" AS ENUM ('AREA', 'CURSO', 'LIVRE');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('EMAIL', 'WHATSAPP', 'LIGACAO', 'LINKEDIN', 'INSTAGRAM', 'REUNIAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoInteracao" AS ENUM ('EMAIL', 'WHATSAPP', 'LIGACAO', 'LINKEDIN', 'INSTAGRAM', 'REUNIAO', 'NOTA');

-- CreateEnum
CREATE TYPE "DirecaoInteracao" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "StatusImportacao" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'SDR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLoginEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_redefinicao_senha" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_redefinicao_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "federacoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "uf" CHAR(2),
    "site" TEXT,
    "instagram" TEXT,
    "fonteUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "federacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nucleos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "federacaoId" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nucleos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ies" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "sigla" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas_juniores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "chaveDedupe" TEXT NOT NULL,
    "razaoSocial" TEXT,
    "cnpj" CHAR(14),
    "iesId" TEXT,
    "federacaoId" TEXT,
    "nucleoId" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "regiao" "Regiao",
    "servicos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "anoFundacao" INTEGER,
    "membrosEstimados" INTEGER,
    "federada" BOOLEAN NOT NULL DEFAULT false,
    "site" TEXT,
    "instagram" TEXT,
    "linkedin" TEXT,
    "facebook" TEXT,
    "emailInstitucional" TEXT,
    "telefoneInstitucional" TEXT,
    "situacaoCadastral" TEXT,
    "idBrasilJunior" TEXT,
    "fonteUrl" TEXT NOT NULL,
    "fontes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coletadoEm" TIMESTAMP(3) NOT NULL,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "statusProspeccao" "StatusProspeccao" NOT NULL DEFAULT 'NAO_TRABALHADA',
    "scoreIcp" INTEGER NOT NULL DEFAULT 0,
    "responsavelId" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_juniores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoTag" NOT NULL DEFAULT 'LIVRE',
    "chave" TEXT NOT NULL,
    "cor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contatos" (
    "id" TEXT NOT NULL,
    "empresaJuniorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "linkedin" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "baseLegal" TEXT,
    "origem" TEXT,
    "optOutEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacoes" (
    "id" TEXT NOT NULL,
    "empresaJuniorId" TEXT NOT NULL,
    "contatoId" TEXT,
    "usuarioId" TEXT,
    "tipo" "TipoInteracao" NOT NULL,
    "direcao" "DirecaoInteracao" NOT NULL DEFAULT 'SAIDA',
    "assunto" TEXT,
    "resumo" TEXT,
    "ocorridaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passoCadenciaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusTarefa" NOT NULL DEFAULT 'PENDENTE',
    "prioridade" "Prioridade" NOT NULL DEFAULT 'MEDIA',
    "venceEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "empresaJuniorId" TEXT,
    "responsavelId" TEXT,
    "criadoPorId" TEXT,
    "passoCadenciaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cadencias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cadencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passos_cadencia" (
    "id" TEXT NOT NULL,
    "cadenciaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "diaOffset" INTEGER NOT NULL DEFAULT 0,
    "canal" "Canal" NOT NULL,
    "templateId" TEXT,
    "instrucoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passos_cadencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates_mensagem" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "canal" "Canal" NOT NULL,
    "assunto" TEXT,
    "corpo" TEXT NOT NULL,
    "variaveis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listas_salvas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "filtros" JSONB NOT NULL,
    "compartilhada" BOOLEAN NOT NULL DEFAULT false,
    "donoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listas_salvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes" (
    "id" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'EMPRESAS_JUNIORES',
    "status" "StatusImportacao" NOT NULL DEFAULT 'PENDENTE',
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "importadas" INTEGER NOT NULL DEFAULT 0,
    "atualizadas" INTEGER NOT NULL DEFAULT 0,
    "ignoradas" INTEGER NOT NULL DEFAULT 0,
    "erros" JSONB,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "importacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "dados" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EmpresaJuniorToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmpresaJuniorToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuarioId_idx" ON "refresh_tokens"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_redefinicao_senha_tokenHash_key" ON "tokens_redefinicao_senha"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "federacoes_sigla_key" ON "federacoes"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "nucleos_nome_federacaoId_key" ON "nucleos"("nome", "federacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ies_chave_key" ON "ies"("chave");

-- CreateIndex
CREATE INDEX "ies_uf_idx" ON "ies"("uf");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_juniores_chaveDedupe_key" ON "empresas_juniores"("chaveDedupe");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_juniores_cnpj_key" ON "empresas_juniores"("cnpj");

-- CreateIndex
CREATE INDEX "empresas_juniores_uf_idx" ON "empresas_juniores"("uf");

-- CreateIndex
CREATE INDEX "empresas_juniores_federacaoId_idx" ON "empresas_juniores"("federacaoId");

-- CreateIndex
CREATE INDEX "empresas_juniores_nomeNormalizado_idx" ON "empresas_juniores"("nomeNormalizado");

-- CreateIndex
CREATE INDEX "empresas_juniores_statusProspeccao_idx" ON "empresas_juniores"("statusProspeccao");

-- CreateIndex
CREATE UNIQUE INDEX "tags_chave_key" ON "tags"("chave");

-- CreateIndex
CREATE INDEX "contatos_empresaJuniorId_idx" ON "contatos"("empresaJuniorId");

-- CreateIndex
CREATE INDEX "interacoes_empresaJuniorId_ocorridaEm_idx" ON "interacoes"("empresaJuniorId", "ocorridaEm");

-- CreateIndex
CREATE INDEX "tarefas_responsavelId_status_venceEm_idx" ON "tarefas"("responsavelId", "status", "venceEm");

-- CreateIndex
CREATE UNIQUE INDEX "passos_cadencia_cadenciaId_ordem_key" ON "passos_cadencia"("cadenciaId", "ordem");

-- CreateIndex
CREATE INDEX "audit_logs_entidade_entidadeId_idx" ON "audit_logs"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "audit_logs_criadoEm_idx" ON "audit_logs"("criadoEm");

-- CreateIndex
CREATE INDEX "_EmpresaJuniorToTag_B_index" ON "_EmpresaJuniorToTag"("B");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_redefinicao_senha" ADD CONSTRAINT "tokens_redefinicao_senha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nucleos" ADD CONSTRAINT "nucleos_federacaoId_fkey" FOREIGN KEY ("federacaoId") REFERENCES "federacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas_juniores" ADD CONSTRAINT "empresas_juniores_iesId_fkey" FOREIGN KEY ("iesId") REFERENCES "ies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas_juniores" ADD CONSTRAINT "empresas_juniores_federacaoId_fkey" FOREIGN KEY ("federacaoId") REFERENCES "federacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas_juniores" ADD CONSTRAINT "empresas_juniores_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "nucleos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas_juniores" ADD CONSTRAINT "empresas_juniores_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_empresaJuniorId_fkey" FOREIGN KEY ("empresaJuniorId") REFERENCES "empresas_juniores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_empresaJuniorId_fkey" FOREIGN KEY ("empresaJuniorId") REFERENCES "empresas_juniores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_passoCadenciaId_fkey" FOREIGN KEY ("passoCadenciaId") REFERENCES "passos_cadencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_empresaJuniorId_fkey" FOREIGN KEY ("empresaJuniorId") REFERENCES "empresas_juniores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_passoCadenciaId_fkey" FOREIGN KEY ("passoCadenciaId") REFERENCES "passos_cadencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cadencias" ADD CONSTRAINT "cadencias_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passos_cadencia" ADD CONSTRAINT "passos_cadencia_cadenciaId_fkey" FOREIGN KEY ("cadenciaId") REFERENCES "cadencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passos_cadencia" ADD CONSTRAINT "passos_cadencia_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates_mensagem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates_mensagem" ADD CONSTRAINT "templates_mensagem_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_salvas" ADD CONSTRAINT "listas_salvas_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmpresaJuniorToTag" ADD CONSTRAINT "_EmpresaJuniorToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "empresas_juniores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmpresaJuniorToTag" ADD CONSTRAINT "_EmpresaJuniorToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
