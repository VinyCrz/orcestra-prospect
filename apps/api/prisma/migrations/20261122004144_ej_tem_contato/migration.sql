-- EJ "tem contato": só EJs com alguma forma de contato aparecem no sistema; as demais ficam ocultas (nada é apagado).
-- A coluna é mantida pelo banco (triggers abaixo) para cobrir seed, importação, edição e contatos sem depender da API.
-- Regra (idêntica ao filtro comContato da API, com string vazia/só espaços tratada como ausente):
--   site | instagram | linkedin | facebook | emailInstitucional | telefoneInstitucional preenchido
--   OU contato da EJ com optOut = false, anonimizadoEm IS NULL e email | telefone | whatsapp | linkedin preenchido.

-- AlterTable
ALTER TABLE "empresas_juniores" ADD COLUMN     "temContato" BOOLEAN NOT NULL DEFAULT false;

-- Texto preenchido: não null e não vazio/só espaços.
CREATE OR REPLACE FUNCTION texto_preenchido(t text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT t IS NOT NULL AND btrim(t) <> ''
$$;

-- Algum canal institucional preenchido (recebe os valores, para servir o trigger BEFORE com NEW.*).
CREATE OR REPLACE FUNCTION ej_tem_canal_institucional(
  site text, instagram text, linkedin text, facebook text, email_inst text, telefone_inst text
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT texto_preenchido(site) OR texto_preenchido(instagram) OR texto_preenchido(linkedin)
      OR texto_preenchido(facebook) OR texto_preenchido(email_inst) OR texto_preenchido(telefone_inst)
$$;

-- Algum contato utilizável da EJ (fora de opt-out, não anonimizado, com e-mail/telefone/WhatsApp/LinkedIn).
-- Usa o índice contatos(empresaJuniorId).
CREATE OR REPLACE FUNCTION ej_tem_contato_pessoa(ej_id text) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "contatos" c
    WHERE c."empresaJuniorId" = ej_id
      AND c."optOut" = false
      AND c."anonimizadoEm" IS NULL
      AND (texto_preenchido(c."email") OR texto_preenchido(c."telefone")
           OR texto_preenchido(c."whatsapp") OR texto_preenchido(c."linkedin"))
  )
$$;

-- Regra completa a partir do id (false se a EJ não existe).
CREATE OR REPLACE FUNCTION ej_tem_contato(ej_id text) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE((
    SELECT ej_tem_canal_institucional(e."site", e."instagram", e."linkedin", e."facebook",
                                      e."emailInstitucional", e."telefoneInstitucional")
           OR ej_tem_contato_pessoa(e."id")
    FROM "empresas_juniores" e WHERE e."id" = ej_id
  ), false)
$$;

-- BEFORE INSERT/UPDATE em empresas_juniores: sempre recalcula (ignora valor escrito pela aplicação).
-- Não toca em contatos, então não há ciclo com o trigger de contatos.
CREATE OR REPLACE FUNCTION trg_ej_tem_contato() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."temContato" := ej_tem_canal_institucional(NEW."site", NEW."instagram", NEW."linkedin", NEW."facebook",
                                                 NEW."emailInstitucional", NEW."telefoneInstitucional")
                      OR ej_tem_contato_pessoa(NEW."id");
  RETURN NEW;
END
$$;

CREATE TRIGGER ej_tem_contato_biu
BEFORE INSERT OR UPDATE ON "empresas_juniores"
FOR EACH ROW EXECUTE FUNCTION trg_ej_tem_contato();

-- AFTER INSERT/UPDATE/DELETE em contatos: recalcula a(s) EJ(s) afetada(s) (nova e antiga, se mudou de EJ).
-- 1) trava as EJs (FOR NO KEY UPDATE, em ordem de id): serializa alterações concorrentes de contatos da mesma
--    EJ (sem isso, dois opt-outs simultâneos poderiam deixar temContato = true) sem conflitar com o
--    FOR KEY SHARE da FK de quem insere contatos; ordem fixa evita deadlock ao mover contato entre EJs.
-- 2) UPDATE só quando o valor muda (IS DISTINCT FROM): o BEFORE da EJ recalcula de novo (mesmo resultado) e
--    não mexe em contatos, logo sem recursão. Não altera atualizadoEm (@updatedAt é do Prisma Client).
-- Na exclusão em cascata da EJ, a linha já não existe e o UPDATE não afeta nada.
CREATE OR REPLACE FUNCTION trg_contato_tem_contato() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ids text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    ids := ARRAY[NEW."empresaJuniorId"];
  ELSIF TG_OP = 'DELETE' THEN
    ids := ARRAY[OLD."empresaJuniorId"];
  ELSE
    ids := ARRAY[NEW."empresaJuniorId", OLD."empresaJuniorId"];
  END IF;

  PERFORM 1 FROM "empresas_juniores" e WHERE e."id" = ANY (ids) ORDER BY e."id" FOR NO KEY UPDATE;

  UPDATE "empresas_juniores" e
     SET "temContato" = ej_tem_contato(e."id")
   WHERE e."id" = ANY (ids)
     AND e."temContato" IS DISTINCT FROM ej_tem_contato(e."id");

  RETURN NULL;
END
$$;

CREATE TRIGGER contato_tem_contato_aiud
AFTER INSERT OR DELETE OR UPDATE OF "empresaJuniorId", "optOut", "anonimizadoEm", "email", "telefone", "whatsapp", "linkedin"
ON "contatos"
FOR EACH ROW EXECUTE FUNCTION trg_contato_tem_contato();

-- Backfill (o trigger BEFORE recalcula a partir das colunas + contatos; só toca as linhas que mudam).
UPDATE "empresas_juniores" e
   SET "temContato" = ej_tem_contato(e."id")
 WHERE e."temContato" IS DISTINCT FROM ej_tem_contato(e."id");

-- CreateIndex
-- Kanban (coluna por status ORDER BY score DESC, nome LIMIT n) e contagem por status/funil — index-only.
CREATE INDEX "empresas_juniores_temContato_statusProspeccao_scoreIcp_nome_idx" ON "empresas_juniores"("temContato", "statusProspeccao", "scoreIcp" DESC, "nome");

-- CreateIndex
-- Dashboard "EJs por UF"/funil por UF e filtro por UF — index-only.
CREATE INDEX "empresas_juniores_temContato_uf_statusProspeccao_idx" ON "empresas_juniores"("temContato", "uf", "statusProspeccao");

-- CreateIndex
-- Lista padrão (ORDER BY nome LIMIT n).
CREATE INDEX "empresas_juniores_temContato_nome_idx" ON "empresas_juniores"("temContato", "nome");
