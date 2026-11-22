-- CreateEnum
CREATE TYPE "TipoSupressao" AS ENUM ('EMAIL', 'TELEFONE');

-- CreateEnum
CREATE TYPE "MotivoSupressao" AS ENUM ('OPT_OUT', 'ANONIMIZACAO');

-- CreateEnum
CREATE TYPE "AcaoOptOut" AS ENUM ('MARCADO', 'DESMARCADO');

-- CreateTable
CREATE TABLE "supressoes_contato" (
    "id" TEXT NOT NULL,
    "tipo" "TipoSupressao" NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "motivo" "MotivoSupressao" NOT NULL,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supressoes_contato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_opt_out" (
    "id" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "acao" "AcaoOptOut" NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_opt_out_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supressoes_contato_hash_key" ON "supressoes_contato"("hash");

-- CreateIndex
CREATE INDEX "supressoes_contato_criadoPorId_idx" ON "supressoes_contato"("criadoPorId");

-- CreateIndex
CREATE INDEX "historico_opt_out_contatoId_criadoEm_idx" ON "historico_opt_out"("contatoId", "criadoEm");

-- CreateIndex
CREATE INDEX "historico_opt_out_usuarioId_idx" ON "historico_opt_out"("usuarioId");

-- CreateIndex
CREATE INDEX "audit_logs_usuarioId_criadoEm_idx" ON "audit_logs"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_acao_criadoEm_idx" ON "audit_logs"("acao", "criadoEm");

-- AddForeignKey
ALTER TABLE "supressoes_contato" ADD CONSTRAINT "supressoes_contato_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_opt_out" ADD CONSTRAINT "historico_opt_out_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_opt_out" ADD CONSTRAINT "historico_opt_out_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integridade (CHECK não é expressável no schema Prisma; mantido só aqui)
-- hash = HMAC-SHA256 em hex minúsculo, calculado na API (pepper em env); nunca o valor em claro
ALTER TABLE "supressoes_contato" ADD CONSTRAINT "supressoes_contato_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$');

-- Backfill: estado atual de opt-out vira a primeira linha do histórico (idempotente por contato)
INSERT INTO "historico_opt_out" ("id", "contatoId", "acao", "motivo", "usuarioId", "criadoEm")
SELECT 'bf7_' || replace(gen_random_uuid()::text, '-', ''), c."id", 'MARCADO', c."optOutMotivo", NULL,
       COALESCE(c."optOutEm", c."atualizadoEm")
FROM "contatos" c
WHERE c."optOut" = true
  AND NOT EXISTS (SELECT 1 FROM "historico_opt_out" h WHERE h."contatoId" = c."id");
