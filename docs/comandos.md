# Comandos — referência completa

Todos os comandos são rodados na raiz do repo, salvo indicação.

## Docker

Se o seu usuário não estiver no grupo `docker`, prefixe cada comando com `sg docker -c "..."`:

```bash
docker compose up -d postgres redis
docker compose up -d --build          # stack completa (api, web, postgres, redis)
docker compose ps
docker compose logs api --tail 100
docker compose logs api | grep -i esqueci   # link de redefinição de senha
docker compose exec api pnpm db:seed
docker compose down                    # sem -v: preserva volumes (pgdata, redisdata)
```

Nunca use `docker compose down -v` sem backup: apaga o volume do Postgres.

## Desenvolvimento local

```bash
cp .env.example .env            # uma vez; ajuste JWT_ACCESS_SECRET e ADMIN_*
pnpm install
docker compose up -d postgres redis
pnpm db:migrate                 # prisma migrate dev
pnpm db:seed
pnpm dev                        # compila shared e sobe API :3001 + web :3000 (watch)
```

## Qualidade

| Comando | Saída |
| --- | --- |
| `pnpm lint` | ESLint em todos os pacotes; silencioso quando limpo |
| `pnpm test` | Vitest (shared, reporter `dot`) + Jest (api, `--silent`); ~1 min |
| `pnpm build` | build de todos os pacotes |
| `pnpm --filter @orcestra/web typecheck` | `tsc --noEmit` do front |
| `pnpm format` | Prettier (escreve arquivos) |

Teste isolado:

```bash
pnpm --filter @orcestra/api exec jest auth.service          # um arquivo de teste da API
pnpm --filter @orcestra/shared exec vitest run normalize    # um arquivo do shared
```

## E2E (Playwright)

Requer a stack no ar (`pnpm dev` ou `docker compose up -d`). URL: `E2E_BASE_URL` (padrão `http://localhost:3000`).

```bash
pnpm --filter @orcestra/web exec playwright install chromium   # só na 1ª vez
pnpm test:e2e                                                   # reporter dot + HTML
pnpm --filter @orcestra/web exec playwright test --list         # valida config sem rodar
```

Relatório HTML: `apps/web/playwright-report/` (não ler; usar só para depurar falhas).
Config: `apps/web/playwright.config.ts`. Specs: `apps/web/e2e/`.

## Banco (Prisma)

```bash
pnpm db:migrate                 # prisma migrate dev (cria migration nova)
pnpm db:migrate:deploy          # prisma migrate deploy (aplica sem criar)
pnpm db:seed                    # ADMIN + base de EJs; idempotente, não sobrescreve trabalho comercial
pnpm --filter @orcestra/api prisma studio   # interface do banco (usa ../../.env)
```

Backup antes de qualquer operação destrutiva: `pg_dump` para `backups/` (pasta fora do git).

## Base de EJs (coletor)

```bash
pnpm coleta                     # reexecuta o coletor (usa cache em data/cache)
pnpm coleta --atualizar           # ignora cache das páginas
pnpm coleta --limite-cnpj=N       # limita consultas novas de CNPJ
pnpm db:seed                    # carrega data/ejs.json no banco
```

Gera `data/ejs.json`, `data/ejs.csv`, `data/federacoes.json`, `data/RELATORIO.md`.

## Serviços por pacote

```bash
pnpm --filter @orcestra/api <script>      # build, dev, start, lint, test, prisma, db:*
pnpm --filter @orcestra/web <script>      # dev, build, start, lint, typecheck, test:e2e
pnpm --filter @orcestra/shared <script>   # build, dev, test, lint
pnpm --filter @orcestra/coleta <script>   # coleta, lint
```

## Processos em background e PIDs

**Nunca** use `pkill -f` ou `pgrep -f` com um padrão que case o próprio comando (ex.: `pkill -f "next dev"`
dentro de um `bash -c "... next dev ..."` mata o shell que executa o comando). Para parar um processo:

1. Ao subir, grave o PID: `pnpm dev > /tmp/orcestra-dev.log 2>&1 & echo $! > /tmp/orcestra-dev.pid`
2. Para parar: `kill "$(cat /tmp/orcestra-dev.pid)"` e remova o arquivo.

Se o PID file não existir, localize pela porta (`ss -ltnp | grep -E ':(3000|3001)\b'`), não pelo nome do comando.
