# Compartilhar com link público (temporário)

O sistema roda neste PC; um túnel da Cloudflare (`cloudflared`, em `~/.local/bin`) gera um link `https://….trycloudflare.com`
que só funciona **enquanto o PC estiver ligado, com os containers e o túnel rodando**. O endereço muda a cada vez que o túnel abre.

```bash
# antes de compartilhar: troque a senha do ADMIN (a padrão está neste README)
pnpm trocar-senha admin@orcestra.com.br
# abrir o túnel (grava o PID e mostra o link)
setsid nohup ~/.local/bin/cloudflared tunnel --no-autoupdate --url http://localhost:3000 > /tmp/cloudflared.log 2>&1 < /dev/null &
sleep 5; pgrep -x cloudflared > /tmp/cloudflared.pid   # o setsid troca o PID: grava o do cloudflared
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1
# fechar o túnel
kill "$(cat /tmp/cloudflared.pid)"
```

Com o link aberto, o `.env` fica em modo seguro: `COOKIE_SECURE=true` e rate limit padrão (5/10). Para rodar a suíte Playwright,
feche o túnel e suba temporariamente `RATE_LIMIT_LOGIN_POR_MIN=30` e `RATE_LIMIT_AUTH_POR_MIN=120` (depois `docker compose up -d api`).
Crie um usuário próprio para cada pessoa (Usuários → Novo usuário, papel SDR ou GESTOR); não compartilhe a conta ADMIN.
