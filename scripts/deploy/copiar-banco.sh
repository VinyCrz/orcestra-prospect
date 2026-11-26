#!/usr/bin/env bash
# Copia o banco local (container "postgres" do docker compose) para um Postgres na nuvem (ex.: Neon).
# Uso: scripts/deploy/copiar-banco.sh 'postgresql://usuario:senha@host/banco?sslmode=require'
#
# - Faz antes um backup local em backups/ (o banco local não é alterado).
# - Recusa se o banco de destino já tiver tabelas (não sobrescreve nada).
# - Tudo numa transação: se der erro, o destino fica como estava.
# Se o seu Docker exige grupo, rode dentro de: sg docker -c "scripts/deploy/copiar-banco.sh '<url>'"
set -euo pipefail

DESTINO="${1:-}"
if [[ -z "$DESTINO" || "$DESTINO" != postgres* ]]; then
  echo "Uso: $0 'postgresql://usuario:senha@host/banco?sslmode=require'" >&2
  exit 1
fi

cd "$(dirname "$0")/../.."
USUARIO="${POSTGRES_USER:-orcestra}"
BANCO="${POSTGRES_DB:-orcestra_prospect}"
mkdir -p backups
ARQ="backups/para-nuvem-$(date +%Y%m%d-%H%M).dump"

echo "1/4 Verificando o destino..."
TABELAS=$(docker compose exec -T postgres psql "$DESTINO" -tAc \
  "select count(*) from information_schema.tables where table_schema='public'")
if [[ "$TABELAS" != "0" ]]; then
  echo "O banco de destino já tem $TABELAS tabela(s). Use um banco vazio (nada foi alterado)." >&2
  exit 1
fi

echo "2/4 Exportando o banco local para $ARQ..."
docker compose exec -T postgres pg_dump -U "$USUARIO" -d "$BANCO" -Fc --no-owner --no-privileges > "$ARQ"

echo "3/4 Restaurando no destino (uma transação só)..."
docker compose exec -T postgres pg_restore --no-owner --no-privileges --no-comments \
  --single-transaction --exit-on-error -d "$DESTINO" < "$ARQ"

echo "4/4 Conferindo..."
for t in empresas_juniores usuarios _prisma_migrations; do
  L=$(docker compose exec -T postgres psql -U "$USUARIO" -d "$BANCO" -tAc "select count(*) from \"$t\"")
  N=$(docker compose exec -T postgres psql "$DESTINO" -tAc "select count(*) from \"$t\"")
  echo "  $t: local $L, nuvem $N"
  [[ "$L" == "$N" ]] || { echo "Contagem diferente em $t!" >&2; exit 1; }
done
echo "Pronto. Backup usado: $ARQ"
