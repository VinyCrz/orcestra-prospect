-- Etapa 2: contatos completos (LGPD), importação (EJs/contatos) com arquivo em bytea,
-- índices para os filtros da lista de EJs e busca por trigramas.
-- Conversões feitas sem perda (RENAME / USING) mesmo com as tabelas vazias.

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "TipoImportacao" AS ENUM ('EJS', 'CONTATOS');

-- CreateEnum
CREATE TYPE "EstrategiaDuplicados" AS ENUM ('MESCLAR', 'IGNORAR');

-- CreateEnum
CREATE TYPE "CargoContato" AS ENUM ('PRESIDENTE', 'DIR_GENTE_GESTAO', 'DIR_COMERCIAL', 'DIR_PROJETOS', 'OUTRO');

-- CreateEnum
CREATE TYPE "BaseLegal" AS ENUM ('LEGITIMO_INTERESSE_B2B', 'CONSENTIMENTO', 'EXECUCAO_CONTRATO', 'OBRIGACAO_LEGAL');

-- AlterEnum (recriado: valores novos não podem ser usados como DEFAULT na mesma transação)
ALTER TYPE "StatusImportacao" RENAME TO "StatusImportacao_old";
CREATE TYPE "StatusImportacao" AS ENUM ('AGUARDANDO_MAPEAMENTO', 'PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU', 'CANCELADA');
ALTER TABLE "importacoes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "importacoes" ALTER COLUMN "status" TYPE "StatusImportacao" USING ("status"::text::"StatusImportacao");
ALTER TABLE "importacoes" ALTER COLUMN "status" SET DEFAULT 'AGUARDANDO_MAPEAMENTO';
DROP TYPE "StatusImportacao_old";

-- AlterTable contatos
ALTER TABLE "contatos" RENAME COLUMN "origem" TO "fonte";
ALTER TABLE "contatos" ADD COLUMN "cargoDescricao" TEXT;
-- cargo texto livre -> enum; texto não reconhecido vai para cargoDescricao
UPDATE "contatos" SET "cargoDescricao" = "cargo"
  WHERE "cargo" IS NOT NULL
    AND "cargo" NOT IN ('PRESIDENTE', 'DIR_GENTE_GESTAO', 'DIR_COMERCIAL', 'DIR_PROJETOS', 'OUTRO');
ALTER TABLE "contatos" ALTER COLUMN "cargo" TYPE "CargoContato" USING (
  CASE WHEN "cargo" IN ('PRESIDENTE', 'DIR_GENTE_GESTAO', 'DIR_COMERCIAL', 'DIR_PROJETOS', 'OUTRO')
       THEN "cargo"::"CargoContato" ELSE 'OUTRO'::"CargoContato" END);
ALTER TABLE "contatos" ALTER COLUMN "cargo" SET DEFAULT 'OUTRO', ALTER COLUMN "cargo" SET NOT NULL;
ALTER TABLE "contatos" ALTER COLUMN "baseLegal" TYPE "BaseLegal" USING (
  CASE WHEN "baseLegal" IN ('LEGITIMO_INTERESSE_B2B', 'CONSENTIMENTO', 'EXECUCAO_CONTRATO', 'OBRIGACAO_LEGAL')
       THEN "baseLegal"::"BaseLegal" ELSE 'LEGITIMO_INTERESSE_B2B'::"BaseLegal" END);
ALTER TABLE "contatos" ALTER COLUMN "baseLegal" SET DEFAULT 'LEGITIMO_INTERESSE_B2B', ALTER COLUMN "baseLegal" SET NOT NULL;
ALTER TABLE "contatos" ADD COLUMN "anonimizadoEm" TIMESTAMP(3),
ADD COLUMN     "mandatoFim" DATE,
ADD COLUMN     "mandatoInicio" DATE,
ADD COLUMN     "optOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "optOutMotivo" TEXT,
ADD COLUMN     "whatsapp" TEXT;
UPDATE "contatos" SET "optOut" = true WHERE "optOutEm" IS NOT NULL;

-- AlterTable importacoes
ALTER TABLE "importacoes" RENAME COLUMN "erros" TO "relatorioErros";
ALTER TABLE "importacoes" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TABLE "importacoes" ALTER COLUMN "tipo" TYPE "TipoImportacao" USING (
  CASE WHEN "tipo" = 'CONTATOS' THEN 'CONTATOS'::"TipoImportacao" ELSE 'EJS'::"TipoImportacao" END);
ALTER TABLE "importacoes" ADD COLUMN "arquivoHash" TEXT,
ADD COLUMN     "arquivoMime" TEXT,
ADD COLUMN     "arquivoTamanho" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "estrategiaDuplicados" "EstrategiaDuplicados" NOT NULL DEFAULT 'IGNORAR',
ADD COLUMN     "iniciadaEm" TIMESTAMP(3),
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "mapeamento" JSONB,
ADD COLUMN     "mensagemErro" TEXT,
ADD COLUMN     "processadas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "erros" INTEGER NOT NULL DEFAULT 0;
-- @updatedAt é preenchido pelo Prisma; default só serviu para linhas pré-existentes
ALTER TABLE "importacoes" ALTER COLUMN "atualizadoEm" DROP DEFAULT;

-- CreateTable
CREATE TABLE "importacoes_arquivos" (
    "importacaoId" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacoes_arquivos_pkey" PRIMARY KEY ("importacaoId"),
    -- limite de 10 MB por arquivo importado
    CONSTRAINT "importacoes_arquivos_conteudo_tamanho_chk" CHECK (octet_length("conteudo") <= 10485760)
);

-- CreateIndex
CREATE INDEX "contatos_mandatoFim_idx" ON "contatos"("mandatoFim");

-- CreateIndex
CREATE INDEX "contatos_email_idx" ON "contatos"("email");

-- CreateIndex
CREATE INDEX "empresas_juniores_regiao_idx" ON "empresas_juniores"("regiao");

-- CreateIndex
CREATE INDEX "empresas_juniores_iesId_idx" ON "empresas_juniores"("iesId");

-- CreateIndex
CREATE INDEX "empresas_juniores_nucleoId_idx" ON "empresas_juniores"("nucleoId");

-- CreateIndex
CREATE INDEX "empresas_juniores_responsavelId_uf_idx" ON "empresas_juniores"("responsavelId", "uf");

-- CreateIndex
CREATE INDEX "empresas_juniores_scoreIcp_nome_idx" ON "empresas_juniores"("scoreIcp" DESC, "nome");

-- CreateIndex
CREATE INDEX "empresas_juniores_membrosEstimados_idx" ON "empresas_juniores"("membrosEstimados");

-- CreateIndex
CREATE INDEX "empresas_juniores_nome_trgm_idx" ON "empresas_juniores" USING GIN ("nome" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "empresas_juniores_nomeNormalizado_trgm_idx" ON "empresas_juniores" USING GIN ("nomeNormalizado" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "empresas_juniores_razaoSocial_trgm_idx" ON "empresas_juniores" USING GIN ("razaoSocial" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "importacoes_criadoEm_idx" ON "importacoes"("criadoEm");

-- CreateIndex
CREATE INDEX "importacoes_usuarioId_criadoEm_idx" ON "importacoes"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "listas_salvas_donoId_idx" ON "listas_salvas"("donoId");

-- CreateIndex
CREATE INDEX "listas_salvas_compartilhada_idx" ON "listas_salvas"("compartilhada");

-- AddForeignKey
ALTER TABLE "importacoes_arquivos" ADD CONSTRAINT "importacoes_arquivos_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
