#!/bin/sh
# Sobe API + front no mesmo container. Se um dos dois cair, encerra o container (o Render reinicia).
set -u

cd /app/apps/api
npx prisma migrate deploy || { echo "Falha nas migrations"; exit 1; }
# Contatos novos da coleta (só preenche campos vazios; não faz nada se data/ejs.json não mudou).
# Falha aqui não impede a subida; limite de 5 min para não travar o deploy.
timeout 300 npx tsx prisma/sincronizar-base.ts || echo "Aviso: sincronização da base de EJs não concluída"

API_PORT=3001 node --max-old-space-size=220 dist/main.js &
API=$!

cd /web
PORT="${PORT:-3000}" HOSTNAME=0.0.0.0 API_INTERNAL_URL=http://127.0.0.1:3001 \
  node --max-old-space-size=160 apps/web/server.js &
WEB=$!

parar() { kill "$API" "$WEB" 2>/dev/null; wait; exit 0; }
trap parar TERM INT

while kill -0 "$API" 2>/dev/null && kill -0 "$WEB" 2>/dev/null; do
  sleep 5
done
echo "Um dos processos parou; encerrando para o Render reiniciar"
kill "$API" "$WEB" 2>/dev/null
wait
exit 1
