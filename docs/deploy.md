# Deploy gratuito (Render + Neon)

Sem cartão de crédito. Endereço: **https://orcestra-prospect.onrender.com**

| Parte | Onde | Plano grátis |
| --- | --- | --- |
| Front (Next.js) + API (NestJS) | **Render**, num serviço Docker só (`deploy/render/`) | 512 MB; hiberna após 15 min sem acesso |
| Redis (filas BullMQ) | **Render Key Value** | 25 MB, sem limite de comandos |
| Banco (PostgreSQL) | **Neon** | 0,5 GB; hiberna sozinho quando ninguém usa |
| Despertador | **cron-job.org** | mantém o serviço acordado |

Por que front e API juntos: o plano grátis do Render cobre um serviço ligado o mês inteiro (750 h).
Dois serviços dormiriam, e o front em outro provedor (Netlify) mostra um selo "Powered by Netlify" que
só sai no plano pago. No mesmo container o front fala com a API por `127.0.0.1`: mesma origem e sem
saltos extras de proxy. Medido localmente: os dois juntos usam ~130 MB.

Por que não Upstash: o BullMQ consulta o Redis o tempo todo e estoura a cota grátis de comandos.
Por que não o Postgres do Render: o gratuito expira em 30 dias.

Render e Neon ficam na Virgínia (EUA), perto um do outro: cada tela faz várias consultas ao banco.

## Ordem

Neon → copiar o banco → Render (Blueprint) → despertador.

## 1. Neon (banco)

1. Entre em **neon.tech** e crie um projeto:
   - região **AWS US East 1 (N. Virginia)**;
   - versão do Postgres **16** (a mesma do local; com versão maior, o `pg_dump` local não consegue fazer backup).
2. Em **Connect**, desligue **Connection pooling** e copie a connection string.
3. Troque `&channel_binding=require` por `&connect_timeout=30` (o banco leva alguns segundos para acordar):
   `postgresql://usuario:senha@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=30`

## 2. Copiar o banco local para a Neon

Leva as EJs, os usuários, as senhas e todo o trabalho comercial. Com o projeto rodando localmente:

```bash
scripts/deploy/copiar-banco.sh 'COLE_AQUI_A_URL_DA_NEON'
```

O script faz um backup em `backups/`, recusa se a Neon já tiver tabelas e confere as contagens no fim.

## 3. Render (front + API + Redis)

1. Entre em **render.com** e conecte o GitHub (dê acesso só ao repositório `orcestra-prospect`).
2. **New › Blueprint**, escolha o repositório. O Render lê o `render.yaml` e cria o
   `orcestra-prospect` e o `orcestra-redis`.
3. Ele pede dois valores:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | a URL da Neon (passo 1) |
| `SUPRESSAO_PEPPER` | **o mesmo** do `.env` local (outro valor invalida a lista de opt-out da LGPD) |

4. Aguarde o deploy (o primeiro leva uns 10 min). Ao subir, a API aplica as migrations pendentes sozinha.
5. Teste `https://orcestra-prospect.onrender.com/api/health`: deve responder `"status":"ok"`.

Se o Render der outro endereço ao serviço, ajuste `WEB_URL` no `render.yaml` (é usado no link de
"esqueci minha senha").

## 4. Despertador

Em **cron-job.org** (grátis, sem cartão), crie um job:
- URL: `https://orcestra-prospect.onrender.com/api/health/vivo`;
- a cada 10 minutos, 24 horas, todos os dias (`*/10 * * * *`).

Sem ele, o primeiro acesso depois de 15 min parado demora cerca de 1 min. A rota `/api/health/vivo` não
consulta o banco: a Neon continua hibernando quando ninguém usa e não gasta a cota de horas. As tarefas
agendadas (alertas às 6h, gamificação de segunda às 3h) rodam na hora.

## Atualizações

`git push` no `master` publica sozinho, quando mudar `apps/`, `packages/shared`, `deploy/render`,
`data/ejs.json`, `data/federacoes.json`, `pnpm-lock.yaml` ou `package.json`. Migrations novas rodam no
deploy, sem apagar dados. Durante o deploy o site fica no ar com a versão anterior.

O banco da nuvem é separado do banco local: o que a equipe cadastra online não aparece no PC, e vice-versa.

## Backup

A Neon grátis guarda só um histórico curto. Faça backup semanal para esta máquina:

```bash
scripts/deploy/backup-nuvem.sh 'URL_DA_NEON'
```

## Limites que valem saber

- **Memória:** 512 MB para front e API juntos. Se o Render acusar falta de memória, o próximo passo é o
  plano pago (Starter) ou separar o front de novo.
- **Primeiro deploy do Render:** pode falhar por tempo se a Neon estiver hibernando. Clique em **Manual Deploy** de novo.
- **Contas inativas:** serviços grátis parados por muito tempo podem ser suspensos (a Neon suspende a computação, não apaga os dados).
