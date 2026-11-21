-- CreateEnum
CREATE TYPE "ResultadoInteracao" AS ENUM ('SEM_RESPOSTA', 'RESPONDEU', 'REUNIAO_MARCADA', 'NAO_INTERESSADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "OrigemTarefa" AS ENUM ('MANUAL', 'INTERACAO', 'MANDATO_VENCENDO', 'NUTRICAO_RETORNO', 'CADENCIA');

-- AlterEnum
ALTER TYPE "Canal" ADD VALUE 'EVENTO';

-- AlterEnum: novo funil. Mapeamento explícito dos valores antigos (sem perda):
--   EM_PROSPECCAO -> PESQUISADA; CONTATO_REALIZADO -> PRIMEIRO_CONTATO;
--   PROPOSTA_ENVIADA/NEGOCIACAO/GANHA -> OPORTUNIDADE; DESCARTADA -> PERDIDA.
-- (No momento da migration as 1.515 EJs estão em NAO_TRABALHADA.)
CREATE TYPE "StatusProspeccao_new" AS ENUM ('NAO_TRABALHADA', 'PESQUISADA', 'PRIMEIRO_CONTATO', 'EM_CONVERSA', 'REUNIAO_AGENDADA', 'OPORTUNIDADE', 'PERDIDA', 'NUTRICAO');
ALTER TABLE "empresas_juniores" ALTER COLUMN "statusProspeccao" DROP DEFAULT;
ALTER TABLE "empresas_juniores" ALTER COLUMN "statusProspeccao" TYPE "StatusProspeccao_new" USING (
  CASE "statusProspeccao"::text
    WHEN 'EM_PROSPECCAO' THEN 'PESQUISADA'
    WHEN 'CONTATO_REALIZADO' THEN 'PRIMEIRO_CONTATO'
    WHEN 'PROPOSTA_ENVIADA' THEN 'OPORTUNIDADE'
    WHEN 'NEGOCIACAO' THEN 'OPORTUNIDADE'
    WHEN 'GANHA' THEN 'OPORTUNIDADE'
    WHEN 'DESCARTADA' THEN 'PERDIDA'
    ELSE "statusProspeccao"::text
  END
)::"StatusProspeccao_new";
ALTER TYPE "StatusProspeccao" RENAME TO "StatusProspeccao_old";
ALTER TYPE "StatusProspeccao_new" RENAME TO "StatusProspeccao";
DROP TYPE "StatusProspeccao_old";
ALTER TABLE "empresas_juniores" ALTER COLUMN "statusProspeccao" SET DEFAULT 'NAO_TRABALHADA';

-- Interacao/Tarefa mudam de formato: as tabelas estavam vazias (conferido antes da migration).
-- DropForeignKey
ALTER TABLE "tarefas" DROP CONSTRAINT "tarefas_responsavelId_fkey";

-- DropIndex
DROP INDEX "interacoes_empresaJuniorId_ocorridaEm_idx";

-- DropIndex
DROP INDEX "tarefas_responsavelId_status_venceEm_idx";

-- AlterTable
ALTER TABLE "empresas_juniores" ADD COLUMN     "dataRetornoNutricao" DATE,
ADD COLUMN     "motivoPerdaDetalhe" TEXT,
ADD COLUMN     "motivoPerdaId" TEXT,
ADD COLUMN     "statusAlteradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: tempo na etapa atual conta a partir do cadastro
UPDATE "empresas_juniores" SET "statusAlteradoEm" = "criadoEm";

-- AlterTable
ALTER TABLE "interacoes" DROP COLUMN "assunto",
DROP COLUMN "direcao",
DROP COLUMN "ocorridaEm",
DROP COLUMN "tipo",
ADD COLUMN     "atualizadoEm" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "canal" "Canal" NOT NULL,
ADD COLUMN     "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "proximoPasso" TEXT,
ADD COLUMN     "proximoPassoData" TIMESTAMP(3),
ADD COLUMN     "resultado" "ResultadoInteracao" NOT NULL DEFAULT 'SEM_RESPOSTA',
ADD COLUMN     "tarefaId" TEXT;

-- AlterTable
ALTER TABLE "tarefas" DROP COLUMN "prioridade",
DROP COLUMN "status",
DROP COLUMN "venceEm",
ADD COLUMN     "adiadaVezes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chaveIdempotencia" TEXT,
ADD COLUMN     "concluida" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contatoId" TEXT,
ADD COLUMN     "origem" "OrigemTarefa" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "vencimento" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "responsavelId" SET NOT NULL;

-- DropEnum
DROP TYPE "DirecaoInteracao";

-- DropEnum
DROP TYPE "Prioridade";

-- DropEnum
DROP TYPE "StatusTarefa";

-- DropEnum
DROP TYPE "TipoInteracao";

-- CreateTable
CREATE TABLE "motivos_perda" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chave" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motivos_perda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_status" (
    "id" TEXT NOT NULL,
    "empresaJuniorId" TEXT NOT NULL,
    "de" "StatusProspeccao",
    "para" "StatusProspeccao" NOT NULL,
    "usuarioId" TEXT,
    "motivo" TEXT,
    "motivoPerdaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "motivos_perda_nome_key" ON "motivos_perda"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "motivos_perda_chave_key" ON "motivos_perda"("chave");

-- CreateIndex
CREATE INDEX "motivos_perda_ativo_ordem_idx" ON "motivos_perda"("ativo", "ordem");

-- CreateIndex
CREATE INDEX "historico_status_empresaJuniorId_criadoEm_idx" ON "historico_status"("empresaJuniorId", "criadoEm");

-- CreateIndex
CREATE INDEX "historico_status_para_criadoEm_idx" ON "historico_status"("para", "criadoEm");

-- CreateIndex
CREATE INDEX "historico_status_motivoPerdaId_idx" ON "historico_status"("motivoPerdaId");

-- CreateIndex
CREATE INDEX "empresas_juniores_motivoPerdaId_idx" ON "empresas_juniores"("motivoPerdaId");

-- CreateIndex
CREATE INDEX "empresas_juniores_dataRetornoNutricao_idx" ON "empresas_juniores"("dataRetornoNutricao");

-- CreateIndex
CREATE UNIQUE INDEX "interacoes_tarefaId_key" ON "interacoes"("tarefaId");

-- CreateIndex
CREATE INDEX "interacoes_empresaJuniorId_data_idx" ON "interacoes"("empresaJuniorId", "data");

-- CreateIndex
CREATE INDEX "interacoes_usuarioId_data_idx" ON "interacoes"("usuarioId", "data");

-- CreateIndex
CREATE INDEX "interacoes_canal_data_idx" ON "interacoes"("canal", "data");

-- CreateIndex
CREATE UNIQUE INDEX "tarefas_chaveIdempotencia_key" ON "tarefas"("chaveIdempotencia");

-- CreateIndex
CREATE INDEX "tarefas_responsavelId_concluida_vencimento_idx" ON "tarefas"("responsavelId", "concluida", "vencimento");

-- CreateIndex
CREATE INDEX "tarefas_empresaJuniorId_criadoEm_idx" ON "tarefas"("empresaJuniorId", "criadoEm");

-- AddForeignKey
ALTER TABLE "empresas_juniores" ADD CONSTRAINT "empresas_juniores_motivoPerdaId_fkey" FOREIGN KEY ("motivoPerdaId") REFERENCES "motivos_perda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status" ADD CONSTRAINT "historico_status_empresaJuniorId_fkey" FOREIGN KEY ("empresaJuniorId") REFERENCES "empresas_juniores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status" ADD CONSTRAINT "historico_status_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status" ADD CONSTRAINT "historico_status_motivoPerdaId_fkey" FOREIGN KEY ("motivoPerdaId") REFERENCES "motivos_perda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integridade
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_adiadaVezes_check" CHECK ("adiadaVezes" >= 0);
