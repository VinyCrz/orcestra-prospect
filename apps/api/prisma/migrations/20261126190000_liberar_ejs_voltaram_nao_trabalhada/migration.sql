-- Correção única de dados (sem mudança de schema).
-- A regra "voltar para Não trabalhada deixa a EJ sem responsável" passou a valer em 26/11/2026.
-- EJs que voltaram para NAO_TRABALHADA antes disso ficaram com o responsável antigo: aqui elas são liberadas.
-- Só entram EJs cuja ÚLTIMA mudança de status foi uma volta para NAO_TRABALHADA (de não nulo); EJs distribuídas
-- pela carteira/rodízio sem passar pelo funil não são tocadas. O responsável anterior fica no AuditLog.

WITH liberar AS (
  SELECT e.id, e."responsavelId" AS antes
  FROM empresas_juniores e
  CROSS JOIN LATERAL (
    SELECT h.de, h.para FROM historico_status h
    WHERE h."empresaJuniorId" = e.id
    ORDER BY h."criadoEm" DESC, h.id DESC
    LIMIT 1
  ) ult
  WHERE e."statusProspeccao" = 'NAO_TRABALHADA'
    AND e."responsavelId" IS NOT NULL
    AND ult.para = 'NAO_TRABALHADA'
    AND ult.de IS NOT NULL
),
auditoria AS (
  INSERT INTO audit_logs (id, "usuarioId", acao, entidade, "entidadeId", dados, "criadoEm")
  SELECT gen_random_uuid()::text, NULL, 'EJ_LIBERADA', 'EmpresaJunior', l.id,
         jsonb_build_object(
           'origem', 'migracao',
           'motivo', 'voltou para Não trabalhada antes da regra de liberação',
           'antes', jsonb_build_object('responsavelId', l.antes),
           'depois', jsonb_build_object('responsavelId', NULL)
         ),
         now()
  FROM liberar l
)
UPDATE empresas_juniores e SET "responsavelId" = NULL
FROM liberar l WHERE l.id = e.id;
