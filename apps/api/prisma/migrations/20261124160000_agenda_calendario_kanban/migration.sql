CREATE TYPE "FaseTarefa" AS ENUM ('IDEIA', 'NAO_INICIADA', 'EM_ANDAMENTO', 'REALIZADA', 'NAO_REALIZADA');
CREATE TYPE "PrioridadeTarefa" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

ALTER TABLE "tarefas"
  ALTER COLUMN "vencimento" DROP NOT NULL,
  ADD COLUMN "fase" "FaseTarefa" NOT NULL DEFAULT 'NAO_INICIADA',
  ADD COLUMN "prioridade" "PrioridadeTarefa" NOT NULL DEFAULT 'MEDIA';

UPDATE "tarefas"
SET "fase" = CASE WHEN "canceladaEm" IS NOT NULL THEN 'NAO_REALIZADA'::"FaseTarefa"
                  ELSE 'REALIZADA'::"FaseTarefa" END
WHERE "concluida" OR "canceladaEm" IS NOT NULL;

-- Cadências e os controles anteriores também podem concluir ou cancelar tarefas.
-- Sincroniza a fase quando esses fluxos alteram os campos de conclusão.
CREATE FUNCTION "sincronizar_fase_tarefa"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."canceladaEm" IS NOT NULL THEN
    NEW."fase" := 'NAO_REALIZADA';
  ELSIF NEW."concluida" THEN
    NEW."fase" := 'REALIZADA';
  ELSIF NEW."fase" IN ('REALIZADA', 'NAO_REALIZADA') THEN
    NEW."fase" := 'NAO_INICIADA';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tarefas_sincronizar_fase"
BEFORE INSERT OR UPDATE OF "fase", "concluida", "canceladaEm" ON "tarefas"
FOR EACH ROW EXECUTE FUNCTION "sincronizar_fase_tarefa"();

CREATE TABLE "subtarefas" (
  "id" TEXT NOT NULL,
  "tarefaId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "concluida" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subtarefas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subtarefas_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "_TarefaColaboradores" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_TarefaColaboradores_AB_pkey" PRIMARY KEY ("A", "B"),
  CONSTRAINT "_TarefaColaboradores_A_fkey" FOREIGN KEY ("A") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "_TarefaColaboradores_B_fkey" FOREIGN KEY ("B") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "_TarefaColaboradores_B_index" ON "_TarefaColaboradores"("B");
CREATE INDEX "subtarefas_tarefaId_criadoEm_id_idx" ON "subtarefas"("tarefaId", "criadoEm", "id");
CREATE INDEX "tarefas_responsavelId_vencimento_id_idx" ON "tarefas"("responsavelId", "vencimento", "id");
