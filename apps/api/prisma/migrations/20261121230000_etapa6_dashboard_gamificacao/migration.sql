-- DropIndex
DROP INDEX "empresas_juniores_federacaoId_idx";

-- DropIndex
DROP INDEX "empresas_juniores_uf_idx";

-- DropIndex
DROP INDEX "historico_status_para_criadoEm_idx";

-- DropIndex
DROP INDEX "interacoes_canal_data_idx";

-- DropIndex
DROP INDEX "interacoes_usuarioId_data_idx";

-- CreateTable
CREATE TABLE "metas_semanais" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "interacoesSemana" INTEGER NOT NULL,
    "reunioesSemana" INTEGER NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "definidoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metas_semanais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conquistas" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "icone" TEXT,
    "repetivel" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conquistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conquistas_usuarios" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "conquistaChave" TEXT NOT NULL,
    "referencia" TEXT NOT NULL DEFAULT '',
    "conquistadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conquistas_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metas_semanais_definidoPorId_idx" ON "metas_semanais"("definidoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "metas_semanais_usuarioId_vigenteDesde_key" ON "metas_semanais"("usuarioId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "conquistas_chave_key" ON "conquistas"("chave");

-- CreateIndex
CREATE INDEX "conquistas_ativa_ordem_idx" ON "conquistas"("ativa", "ordem");

-- CreateIndex
CREATE INDEX "conquistas_usuarios_conquistadaEm_idx" ON "conquistas_usuarios"("conquistadaEm" DESC);

-- CreateIndex
CREATE INDEX "conquistas_usuarios_conquistaChave_idx" ON "conquistas_usuarios"("conquistaChave");

-- CreateIndex
CREATE UNIQUE INDEX "conquistas_usuarios_usuarioId_conquistaChave_referencia_key" ON "conquistas_usuarios"("usuarioId", "conquistaChave", "referencia");

-- CreateIndex
CREATE INDEX "empresas_juniores_uf_statusProspeccao_idx" ON "empresas_juniores"("uf", "statusProspeccao");

-- CreateIndex
CREATE INDEX "empresas_juniores_federacaoId_statusProspeccao_idx" ON "empresas_juniores"("federacaoId", "statusProspeccao");

-- CreateIndex
CREATE INDEX "historico_status_criadoEm_para_empresaJuniorId_idx" ON "historico_status"("criadoEm", "para", "empresaJuniorId");

-- CreateIndex
CREATE INDEX "historico_status_para_criadoEm_motivoPerdaId_idx" ON "historico_status"("para", "criadoEm", "motivoPerdaId");

-- CreateIndex
CREATE INDEX "historico_status_usuarioId_para_idx" ON "historico_status"("usuarioId", "para");

-- CreateIndex
CREATE INDEX "interacoes_usuarioId_data_canal_resultado_idx" ON "interacoes"("usuarioId", "data", "canal", "resultado");

-- CreateIndex
CREATE INDEX "interacoes_data_usuarioId_canal_resultado_idx" ON "interacoes"("data", "usuarioId", "canal", "resultado");

-- AddForeignKey
ALTER TABLE "metas_semanais" ADD CONSTRAINT "metas_semanais_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas_semanais" ADD CONSTRAINT "metas_semanais_definidoPorId_fkey" FOREIGN KEY ("definidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conquistas_usuarios" ADD CONSTRAINT "conquistas_usuarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conquistas_usuarios" ADD CONSTRAINT "conquistas_usuarios_conquistaChave_fkey" FOREIGN KEY ("conquistaChave") REFERENCES "conquistas"("chave") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integridade (índice parcial e CHECK não são expressáveis no schema Prisma; mantidos só aqui)
-- uma meta GLOBAL por vigência (NULLs não colidem no único (usuarioId, vigenteDesde))
CREATE UNIQUE INDEX "metas_semanais_global_vigenteDesde_key" ON "metas_semanais"("vigenteDesde") WHERE "usuarioId" IS NULL;
ALTER TABLE "metas_semanais" ADD CONSTRAINT "metas_semanais_valores_check" CHECK ("interacoesSemana" >= 0 AND "reunioesSemana" >= 0);
-- vigência começa numa segunda-feira (semana ISO)
ALTER TABLE "metas_semanais" ADD CONSTRAINT "metas_semanais_vigenteDesde_segunda_check" CHECK (EXTRACT(ISODOW FROM "vigenteDesde") = 1);
-- referência da conquista semanal no formato ISO (AAAA-Www)
ALTER TABLE "conquistas_usuarios" ADD CONSTRAINT "conquistas_usuarios_referencia_semana_check" CHECK (
  "conquistaChave" <> 'SEMANA_META_BATIDA' OR "referencia" ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'
);
