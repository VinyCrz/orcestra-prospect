-- CreateEnum
CREATE TYPE "StatusInscricao" AS ENUM ('ATIVA', 'CONCLUIDA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "MotivoEncerramento" AS ENUM ('RESPOSTA', 'AVANCO_FUNIL', 'MANUAL', 'OPT_OUT');

-- AlterTable
ALTER TABLE "cadencias" ADD COLUMN     "chave" TEXT;

-- AlterTable
ALTER TABLE "interacoes" ADD COLUMN     "inscricaoCadenciaId" TEXT;

-- AlterTable
ALTER TABLE "tarefas" ADD COLUMN     "canceladaEm" TIMESTAMP(3),
ADD COLUMN     "inscricaoCadenciaId" TEXT;

-- AlterTable
ALTER TABLE "templates_mensagem" ADD COLUMN     "chave" TEXT;

-- CreateTable
CREATE TABLE "inscricoes_cadencia" (
    "id" TEXT NOT NULL,
    "empresaJuniorId" TEXT NOT NULL,
    "cadenciaId" TEXT NOT NULL,
    "contatoId" TEXT,
    "responsavelId" TEXT NOT NULL,
    "inscritoPorId" TEXT,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusInscricao" NOT NULL DEFAULT 'ATIVA',
    "motivoEncerramento" "MotivoEncerramento",
    "motivoDetalhe" TEXT,
    "encerradaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscricoes_cadencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inscricoes_cadencia_empresaJuniorId_status_idx" ON "inscricoes_cadencia"("empresaJuniorId", "status");

-- CreateIndex
CREATE INDEX "inscricoes_cadencia_cadenciaId_status_iniciadaEm_idx" ON "inscricoes_cadencia"("cadenciaId", "status", "iniciadaEm");

-- CreateIndex
CREATE INDEX "inscricoes_cadencia_responsavelId_status_idx" ON "inscricoes_cadencia"("responsavelId", "status");

-- CreateIndex
CREATE INDEX "inscricoes_cadencia_contatoId_idx" ON "inscricoes_cadencia"("contatoId");

-- CreateIndex
CREATE UNIQUE INDEX "cadencias_chave_key" ON "cadencias"("chave");

-- CreateIndex
CREATE INDEX "interacoes_inscricaoCadenciaId_idx" ON "interacoes"("inscricaoCadenciaId");

-- CreateIndex
CREATE INDEX "tarefas_inscricaoCadenciaId_concluida_vencimento_idx" ON "tarefas"("inscricaoCadenciaId", "concluida", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "tarefas_inscricaoCadenciaId_passoCadenciaId_key" ON "tarefas"("inscricaoCadenciaId", "passoCadenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "templates_mensagem_chave_key" ON "templates_mensagem"("chave");

-- CreateIndex
CREATE INDEX "templates_mensagem_canal_ativo_idx" ON "templates_mensagem"("canal", "ativo");

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_inscricaoCadenciaId_fkey" FOREIGN KEY ("inscricaoCadenciaId") REFERENCES "inscricoes_cadencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_inscricaoCadenciaId_fkey" FOREIGN KEY ("inscricaoCadenciaId") REFERENCES "inscricoes_cadencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscricoes_cadencia" ADD CONSTRAINT "inscricoes_cadencia_empresaJuniorId_fkey" FOREIGN KEY ("empresaJuniorId") REFERENCES "empresas_juniores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscricoes_cadencia" ADD CONSTRAINT "inscricoes_cadencia_cadenciaId_fkey" FOREIGN KEY ("cadenciaId") REFERENCES "cadencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscricoes_cadencia" ADD CONSTRAINT "inscricoes_cadencia_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscricoes_cadencia" ADD CONSTRAINT "inscricoes_cadencia_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscricoes_cadencia" ADD CONSTRAINT "inscricoes_cadencia_inscritoPorId_fkey" FOREIGN KEY ("inscritoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integridade (índice parcial e CHECK não são expressáveis no schema Prisma; mantidos só aqui)
-- no máximo UMA inscrição ATIVA por EJ + cadência (também atende "inscrições ativas da EJ")
CREATE UNIQUE INDEX "inscricoes_cadencia_ativa_unica" ON "inscricoes_cadencia"("empresaJuniorId", "cadenciaId") WHERE "status" = 'ATIVA';
ALTER TABLE "inscricoes_cadencia" ADD CONSTRAINT "inscricoes_cadencia_status_check" CHECK (
  ("status" = 'ATIVA' AND "encerradaEm" IS NULL AND "motivoEncerramento" IS NULL)
  OR ("status" = 'CONCLUIDA' AND "encerradaEm" IS NOT NULL AND "motivoEncerramento" IS NULL)
  OR ("status" = 'ENCERRADA' AND "encerradaEm" IS NOT NULL AND "motivoEncerramento" IS NOT NULL)
);
ALTER TABLE "passos_cadencia" ADD CONSTRAINT "passos_cadencia_ordem_check" CHECK ("ordem" >= 1);
ALTER TABLE "passos_cadencia" ADD CONSTRAINT "passos_cadencia_diaOffset_check" CHECK ("diaOffset" >= 0);
-- cancelada implica concluída (some da agenda sem mudar as consultas por concluida = false)
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_cancelada_check" CHECK ("canceladaEm" IS NULL OR "concluida");
