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
   - versão do Postgres **16** (a mesma do local).
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

4. Deploy. Se quiser, troque o nome do site em **Site configuration › Change site name** (ex.: `orcestra-prospect`).

## 5. Ajustar o `WEB_URL`

No Render, em `orcestra-api › Environment`, ponha a URL final da Netlify em `WEB_URL`. Ela é usada no
link de "esqueci minha senha". Salvar refaz o deploy.

## 6. Despertador (evita a espera de ~1 min)

1. Em **cron-job.org** (grátis, sem cartão), crie um job:
   - URL: `https://orcestra-api.onrender.com/health/vivo`;
   - a cada 10 minutos;
   - de segunda a sexta, das 5h50 às 20h;
   - fuso `America/Sao_Paulo`.
2. A rota `/health/vivo` não consulta o banco, então a Neon continua hibernando quando ninguém usa e
   não gasta a cota de horas.
3. Fora desse horário, o primeiro acesso demora cerca de 1 min.
4. Tarefas agendadas:
   - os alertas diários (6h) rodam na hora certa;
   - a gamificação de segunda às 3h roda quando a API acordar (5h50).

## Atualizações

`git push` no `master` publica sozinho:
- **Netlify:** sempre;
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
- **Contas inativas:** serviços grátis parados por muito tempo podem ser suspensos (a Neon suspende a computação, não apaga os dados).
