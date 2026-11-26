# Deploy gratuito (Render + Neon + Netlify)

Sem cartão de crédito. Tudo com login pelo GitHub.

| Parte | Onde | Plano grátis |
| --- | --- | --- |
| Front (Next.js) | **Netlify** | site + funções (o proxy `/api/*` roda como função) |
| API (NestJS) | **Render** (web service Docker) | 512 MB; hiberna após 15 min sem acesso |
| Redis (filas BullMQ) | **Render Key Value** | 25 MB, sem limite de comandos |
| Banco (PostgreSQL) | **Neon** | 0,5 GB; hiberna sozinho quando ninguém usa |

Por que não Upstash: o BullMQ consulta o Redis o tempo todo e estoura a cota grátis de comandos.
Por que não o Postgres do Render: o gratuito expira em 30 dias.

Todos na costa leste dos EUA (Virgínia/Ohio), perto uns dos outros: cada tela faz várias consultas ao
banco, e banco longe da API deixaria tudo lento.

## Ordem

Neon → copiar o banco → Render → Netlify → ajustar `WEB_URL` → despertador.

## 1. Neon (banco)

1. Entre em **neon.tech** com o GitHub e crie um projeto:
   - região **AWS US East (N. Virginia)**;
   - versão do Postgres **16** (a mesma do local; com versão maior, o `pg_dump` local não consegue fazer backup).
2. Em **Connect**, desligue **Connection pooling** e copie a connection string.
3. Acrescente `&connect_timeout=30` ao final (o banco leva alguns segundos para acordar). Fica assim:
   `postgresql://usuario:senha@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=30`

## 2. Copiar o banco local para a Neon

Leva as EJs, os usuários, as senhas e todo o trabalho comercial. Com o projeto rodando localmente:

```bash
scripts/deploy/copiar-banco.sh 'COLE_AQUI_A_URL_DA_NEON'
```

O script faz um backup em `backups/`, recusa se a Neon já tiver tabelas e confere as contagens no fim.

## 3. Render (API + Redis)

1. Entre em **render.com** com o GitHub e autorize o repositório `orcestra-prospect`.
2. **New › Blueprint**, escolha o repositório. O Render lê o `render.yaml` e cria a `orcestra-api` e a `orcestra-redis`.
3. Ele pede quatro valores:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | a URL da Neon (passo 1) |
| `SUPRESSAO_PEPPER` | **o mesmo** do `.env` local (outro valor invalida a lista de opt-out da LGPD) |
| `PROXY_SECRET` | gere com `openssl rand -hex 32` e guarde: vai também na Netlify |
| `WEB_URL` | por enquanto `https://orcestra-prospect.netlify.app`; ajuste no passo 5 |

4. Aguarde o deploy (o primeiro leva uns 10 min). Ao subir, a API aplica as migrations pendentes sozinha.
5. Teste `https://orcestra-api.onrender.com/health`: deve responder `"status":"ok"`. Se o Render tiver
   dado outro nome, use a URL que aparece no painel.

## 4. Netlify (front)

1. Entre em **netlify.com** com o GitHub: **Add new site › Import an existing project**, repositório `orcestra-prospect`.
2. Configuração do build:
   - **Base directory:** vazio;
   - **Package directory:** `apps/web`.
   - O resto vem do `apps/web/netlify.toml`.
3. Em **Environment variables**, com escopo "All":

| Variável | Valor |
| --- | --- |
| `API_INTERNAL_URL` | `https://orcestra-api.onrender.com` (sem barra no final) |
| `PROXY_SECRET` | o mesmo do Render |

4. Em **Address**, use `orcestra-prospect` e clique em **Start building web**.
5. A Netlify cria o site **privado** (só quem tem login na Netlify entra; o endereço responde 401). Em
   **Project configuration › General › Project visibility**: **Customize** › **Private** › **Previews only**.
   Assim a produção fica aberta (o sistema tem login próprio) e só as prévias continuam privadas.

## 5. Ajustar o `WEB_URL`

No Render, em `orcestra-api › Environment`, ponha a URL final da Netlify em `WEB_URL`. Ela é usada no
link de "esqueci minha senha". Salvar refaz o deploy.

## 6. Despertador (evita a espera de ~1 min)

1. Em **cron-job.org** (grátis, sem cartão), crie um job:
   - URL: `https://orcestra-api.onrender.com/health/vivo`;
   - a cada 10 minutos, **24 horas, todos os dias** (`*/10 * * * *`);
   - fuso `America/Sao_Paulo`.
2. Por que 24h: o proxy da Netlify espera no máximo ~10 s, e a API dormindo leva ~50 s para acordar.
   Com ela dormindo, o primeiro acesso daria erro 502. O plano grátis do Render (750 h/mês) cobre um
   serviço ligado o mês inteiro.
3. A rota `/health/vivo` não consulta o banco: a Neon continua hibernando quando ninguém usa e não
   gasta a cota de horas. As tarefas agendadas (alertas às 6h, gamificação de segunda às 3h) rodam na hora.

## Atualizações

`git push` no `master` publica sozinho:
- **Netlify:** quando mudar `apps/web`, `packages/shared`, `pnpm-lock.yaml` ou `package.json`. Cada
  build gasta ~15 dos 300 créditos mensais (cerca de 20 publicações por mês): junte alterações pequenas
  num push só;
- **Render:** só quando mudar `apps/api`, `packages/shared`, `data/ejs.json`, `data/federacoes.json` ou o `pnpm-lock.yaml`.

Migrations novas rodam no deploy da API, sem apagar dados. O banco da nuvem é separado do banco local:
o que a equipe cadastra online não aparece no PC, e vice-versa.

## Backup

A Neon grátis guarda só um histórico curto. Faça backup semanal para esta máquina:

```bash
scripts/deploy/backup-nuvem.sh 'URL_DA_NEON'
```

## Limites que valem saber

- **Importação de planilha:** na Netlify, o corpo de uma requisição vai até ~6 MB, então use arquivos de até ~5 MB.
- **Primeiro deploy do Render:** pode falhar por tempo se a Neon estiver hibernando. Clique em **Manual Deploy** de novo.
- **Créditos da Netlify:** 300 por mês, somando builds e uso do site. Acompanhe em **Usage** no painel.
- **Contas inativas:** serviços grátis parados por muito tempo podem ser suspensos (a Neon suspende a computação, não apaga os dados).
