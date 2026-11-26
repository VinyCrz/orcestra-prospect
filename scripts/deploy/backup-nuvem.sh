#!/usr/bin/env bash
# Backup do banco na nuvem (Neon) para backups/ desta máquina. Uso: scripts/deploy/backup-nuvem.sh '<DATABASE_URL>'
# Usa o pg_dump do container "postgres" do docker compose (não precisa instalar nada).
set -euo pipefail
URL="${1:?Uso: $0 '<DATABASE_URL da Neon>'}"
cd "$(dirname "$0")/../.."
mkdir -p backups
ARQ="backups/nuvem-$(date +%Y%m%d-%H%M).dump"
docker compose exec -T postgres pg_dump "$URL" -Fc --no-owner --no-privileges > "$ARQ"
echo "Backup salvo em $ARQ ($(du -h "$ARQ" | cut -f1))"
