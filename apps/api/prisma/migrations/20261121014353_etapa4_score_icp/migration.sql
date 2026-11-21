-- CreateEnum
CREATE TYPE "FaixaIcp" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "NaturezaIes" AS ENUM ('PUBLICA', 'PRIVADA');

-- CreateEnum
CREATE TYPE "CriterioIcp" AS ENUM ('FEDERADA', 'FAIXA_MEMBROS', 'AREAS_ALINHADAS', 'REGIAO_PRIORITARIA', 'IES_PUBLICA_PRIVADA', 'TEM_SITE_REDES', 'TEM_DECISOR', 'INTERACAO_30D', 'DADOS_VERIFICADOS');

-- AlterTable
ALTER TABLE "empresas_juniores" ADD COLUMN     "faixaIcp" "FaixaIcp",
ADD COLUMN     "scoreCalculadoEm" TIMESTAMP(3),
ADD COLUMN     "scoreDetalhe" JSONB,
ADD COLUMN     "scoreVersao" INTEGER;

-- AlterTable
ALTER TABLE "ies" ADD COLUMN     "natureza" "NaturezaIes";

-- CreateTable
CREATE TABLE "config_score" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "limiarA" INTEGER NOT NULL DEFAULT 75,
    "limiarB" INTEGER NOT NULL DEFAULT 50,
    "limiarC" INTEGER NOT NULL DEFAULT 25,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "atualizadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criterios_score" (
    "id" TEXT NOT NULL,
    "chave" "CriterioIcp" NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "peso" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "atualizadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "criterios_score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "criterios_score_chave_key" ON "criterios_score"("chave");

-- CreateIndex
CREATE INDEX "criterios_score_ativo_ordem_idx" ON "criterios_score"("ativo", "ordem");

-- CreateIndex
CREATE INDEX "empresas_juniores_faixaIcp_scoreIcp_idx" ON "empresas_juniores"("faixaIcp", "scoreIcp" DESC);

-- CreateIndex
CREATE INDEX "empresas_juniores_responsavelId_statusProspeccao_scoreIcp_idx" ON "empresas_juniores"("responsavelId", "statusProspeccao", "scoreIcp" DESC);

-- AddForeignKey
ALTER TABLE "config_score" ADD CONSTRAINT "config_score_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterios_score" ADD CONSTRAINT "criterios_score_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integridade (CHECK não é expressável no schema Prisma; mantido só aqui)
ALTER TABLE "empresas_juniores" ADD CONSTRAINT "empresas_juniores_scoreIcp_check" CHECK ("scoreIcp" BETWEEN 0 AND 100);
ALTER TABLE "criterios_score" ADD CONSTRAINT "criterios_score_peso_check" CHECK ("peso" BETWEEN 0 AND 100);
-- linha única
ALTER TABLE "config_score" ADD CONSTRAINT "config_score_singleton_check" CHECK ("id" = 'default');
ALTER TABLE "config_score" ADD CONSTRAINT "config_score_limiares_check" CHECK (0 <= "limiarC" AND "limiarC" < "limiarB" AND "limiarB" < "limiarA" AND "limiarA" <= 100);
ALTER TABLE "config_score" ADD CONSTRAINT "config_score_versao_check" CHECK ("versao" >= 1);
