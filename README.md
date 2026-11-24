# Orc'estra Prospect

Plataforma interna de **prospecção B2B** da Orc'estra Gamificação, focada em Empresas Juniores (EJs) do
Movimento Empresa Júnior. Reúne a base de EJs com contato público, funil de vendas, agenda, cadências de
mensagem, score de ICP, dashboard com gamificação e controles de LGPD.

**Situação:** etapas 1 a 7 concluídas. Base com 1.515 EJs (cadastro nacional + Receita Federal), das quais
759 têm algum canal público confirmado (site, Instagram, LinkedIn, e-mail ou telefone institucional) e
aparecem no sistema. Detalhes em [`data/RELATORIO.md`](data/RELATORIO.md).

## Sumário

- [Stack](#stack) · [Estrutura do repositório](#estrutura-do-repositório) · [Como rodar](#como-rodar)
- [Arquitetura](#arquitetura) · [Base de Empresas Juniores](#base-de-empresas-juniores)
- [Variáveis de ambiente](#variáveis-de-ambiente) · [Papéis e permissões](#papéis-e-permissões)
- [Funcionalidades e como testar](#funcionalidades-e-como-testar) · [LGPD](#lgpd)
- [Backup do banco](#backup-do-banco) · [Testes](#testes) · [Design](#design) · [Documentação](#documentação)

## Stack

| Camada        | Tecnologias                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Monorepo      | pnpm workspaces — `apps/web`, `apps/api`, `packages/shared`, `scripts/coleta`                                            |
| Front         | Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Query/Table · React Hook Form · Zod |
| Back          | NestJS 11 · Prisma 6 · PostgreSQL 16 · Swagger em `/docs` · Redis 7 + BullMQ (importação, score, alertas) |
| Compartilhado | `@orcestra/shared`: enums, tipos, schemas Zod, normalizador e deduplicador                                               |
| Testes        | Vitest (shared) · Jest (API) · Playwright (E2E)                                                                          |

## Estrutura do repositório

```
apps/
  api/            API NestJS (módulos em src/, Prisma em prisma/, testes Jest em test/)
  web/            Front Next.js (rotas em src/app, componentes em src/components, E2E em e2e/)
packages/
  shared/         Enums, tipos, schemas Zod, normalizador e deduplicador (usados pelo front e pela API)
scripts/
  coleta/         Coletor da base de EJs (fontes públicas, Receita, IBGE, verificação de sites)
data/             Base gerada pelo coletor (ejs.json/csv, federacoes.json, redes-encontradas.json, RELATORIO.md)
docs/             Documentação técnica (comandos, arquitetura, base de EJs, decisões)
brand/            Paleta e logo da marca
docker-compose.yml, .env.example, package.json, pnpm-workspace.yaml
```

## Como rodar

### Pré-requisitos

Node 20+ (testado com 22 e 26), pnpm 9 (`npm i -g pnpm@9`), Docker + Docker Compose.

### Opção A — tudo em Docker

```bash
cp .env.example .env            # ajuste JWT_ACCESS_SECRET e ADMIN_* (obrigatório em produção)
docker compose up -d --build    # postgres, redis, api (aplica migrations ao subir) e web
docker compose exec api pnpm db:seed   # cria o ADMIN e carrega federações, IES e EJs (idempotente)
```

### Opção B — desenvolvimento local (hot reload)

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis
pnpm db:migrate                 # prisma migrate dev
pnpm db:seed
pnpm dev                        # API em :3001 e web em :3000
```

### Acessos

| O quê       | URL                                                                        |
| ----------- | -------------------------------------------------------------------------- |
| Aplicação   | http://localhost:3000                                                      |
| API         | http://localhost:3001                                                      |
| Swagger     | http://localhost:3001/docs — **só com a API em dev** (`pnpm dev`); desligado com `NODE_ENV=production` (container) |
| Healthcheck | http://localhost:3001/health (também via http://localhost:3000/api/health) |

Usuário inicial: o que estiver em `ADMIN_EMAIL` / `ADMIN_SENHA` no `.env`
(padrão do `.env.example`: `admin@orcestra.com.br` / `TroqueEstaSenha123!` — **troque**).

### Scripts (raiz)

| Script                   | O que faz                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`               | compila o shared e sobe API + web em modo watch                                                             |
| `pnpm build`             | build de todos os pacotes                                                                                   |
| `pnpm lint`              | ESLint em todos os pacotes                                                                                  |
| `pnpm test`              | testes unitários (shared + API)                                                                             |
| `pnpm test:e2e`          | Playwright (requer a stack rodando; `npx playwright install chromium` na 1ª vez)                            |
| `pnpm db:migrate`        | `prisma migrate dev`                                                                                        |
| `pnpm db:migrate:deploy` | `prisma migrate deploy`                                                                                     |
| `pnpm db:seed`           | seed idempotente (ADMIN + base de EJs)                                                                      |
| `pnpm coleta`            | reexecuta o coletor e regrava `data/ejs.json`, `data/ejs.csv`, `data/federacoes.json` e `data/RELATORIO.md` |
| `pnpm format`            | Prettier                                                                                                    |

## Arquitetura

```
apps/
  api/            NestJS — auth, usuários, empresas-juniores, federações, health, filas (BullMQ)
    prisma/       schema.prisma, migrations, seed.ts
    test/         testes unitários (auth service, guards)
  web/            Next.js — login, esqueci/redefinir senha, EJs (lista + detalhe), usuários
    src/app/api/  proxy /api/* → API (mesma origem para o cookie httpOnly)
    e2e/          Playwright
packages/shared/  tipos, enums, schemas Zod, normalizador/deduplicador (+ testes)
scripts/coleta/   coletor reexecutável da base de EJs
data/             ejs.json, ejs.csv, federacoes.json, RELATORIO.md (cache em data/cache, fora do git)
```

### Autenticação

- Senhas com **argon2id**.
- **Access token JWT** (15 min, em memória no front, enviado como `Bearer`).
- **Refresh token** opaco (7 dias) em cookie `httpOnly`, `SameSite=Strict` (`Secure` em produção via
  `COOKIE_SECURE=true`). No banco fica só o **hash SHA-256**. A cada uso o token é **rotacionado**; reuso
  de um token já revogado derruba todas as sessões do usuário.
- Guards globais: `JwtAuthGuard` (exige token e usuário **ativo** — desativar um usuário corta o acesso
  imediatamente) e `RolesGuard` (`@Papeis('ADMIN')`). Rotas públicas usam `@Public()`.
- Papéis: ver **Papéis e permissões** abaixo.
- Senhas: mínimo 10 caracteres com letra, número e símbolo (`senhaSchema` do shared, usado na API, no front e no seed).
- **Rate limit** (`@nestjs/throttler`): login 5/min por IP+e-mail; refresh, esqueci e redefinir senha 10/min por IP
  (`RATE_LIMIT_LOGIN_POR_MIN` / `RATE_LIMIT_AUTH_POR_MIN`). Acima disso, 429 com mensagem em pt-BR.
- `helmet`, `trust proxy` = 1 (o proxy do web sobrescreve `X-Forwarded-For`), CORS desligado por padrão.
- Login com sucesso e falha vão para o AuditLog (`LOGIN_OK` / `LOGIN_FALHOU`, e-mail mascarado), com IP.
- "Esqueci minha senha": gera token de uso único (1 h). **Fora de produção** o link vai para o log da API
  (`docker compose logs api | grep esqueci`); em produção não. A resposta é idêntica exista ou não o e-mail.
- Front: o `middleware` redireciona para `/login` quando não há cookie de sessão; o layout logado valida a
  sessão e o papel (a API valida de novo).

### Banco de dados

O schema já contém todas as entidades previstas: `Usuario`, `Federacao`, `Nucleo`, `Ies`, `EmpresaJunior`,
`Contato`, `Interacao`, `Tarefa`, `Cadencia`, `PassoCadencia`, `TemplateMensagem`, `Tag`, `ListaSalva`,
`Importacao`, `AuditLog` (+ `RefreshToken` e `TokenRedefinicaoSenha` para o auth).
`EmpresaJunior.chaveDedupe` (CNPJ ou nome+IES+UF normalizados) garante seed idempotente.

## Base de Empresas Juniores

Montada pelo coletor (`pnpm coleta`) só com fontes públicas: cadastro nacional exposto pela API da FEJERS,
páginas das federações e universidades, Receita Federal (CNPJ), IBGE, verificação automática dos sites e
redes confirmadas por busca na web (cada uma com link de evidência em `data/redes-encontradas.json`).
Nada é inventado (campo sem fonte = `null`) e só entram dados institucionais (LGPD).

EJs sem nenhum canal de contato ficam **ocultas** (não apagadas). Pipeline, regras e como atualizar:
[`docs/base-ejs.md`](docs/base-ejs.md). Totais, fontes e lacunas: [`data/RELATORIO.md`](data/RELATORIO.md).

## Variáveis de ambiente

Copie `.env.example` para `.env`. Todas estão comentadas no arquivo; as principais:

| Variável | Para quê |
| --- | --- |
| `POSTGRES_*`, `DATABASE_URL` | banco (no compose a API usa o host `postgres`) |
| `REDIS_URL` | filas BullMQ (importação, score, alertas, gamificação) |
| `JWT_ACCESS_SECRET` | assinatura do access token — `openssl rand -base64 48` |
| `JWT_ACCESS_TTL`, `REFRESH_TOKEN_TTL_DIAS` | validade dos tokens |
| `COOKIE_SECURE` | `true` em produção (HTTPS) |
| `WEB_URL` | URL pública do front (link de redefinição de senha) |
| `CORS_ORIGINS` | vazio = CORS desligado (o browser só fala com a API pelo proxy `/api/*`) |
| `SUPRESSAO_PEPPER` | pepper do HMAC da lista de supressão LGPD — `openssl rand -hex 32`; **obrigatório em produção, não troque depois de usar** |
| `RATE_LIMIT_LOGIN_POR_MIN`, `RATE_LIMIT_AUTH_POR_MIN` | rate limit (padrão 5 e 10). para rodar a suíte Playwright, suba temporariamente para 30 e 120 |
| `API_INTERNAL_URL` | URL que o servidor Next usa para chegar na API |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | ADMIN criado pelo seed (senha precisa atender à política) |

## Papéis e permissões

| Ação | SDR | GESTOR | ADMIN |
| --- | --- | --- | --- |
| Ver EJs, contatos, funil, dashboard | ✅ (dashboard só os dados dele) | ✅ | ✅ |
| Editar EJ, registrar interação, mover no kanban, inscrever em cadência | só EJs da carteira dele | ✅ | ✅ |
| Carteira (atribuir/rodízio), importação CSV/XLSX | — | ✅ | ✅ |
| Templates de mensagem | ler | ✅ | ✅ |
| Desmarcar opt-out, exportar/anonimizar/excluir contato | — | ✅ | ✅ |
| Cadências, score de ICP, metas, motivos de perda, usuários, auditoria, LGPD/retenção | ler (onde houver tela) | ler | ✅ |

## Funcionalidades e como testar

| Etapa | Onde | Como testar rapidamente |
| --- | --- | --- |
| 1–2 Base, filtros, contatos, listas, ações em massa, carteira, importação | `/empresas-juniores`, `/carteira`, `/importacoes` | filtrar por UF/faixa, abrir uma EJ, salvar uma lista |
| 3 Funil, interações, timeline, agenda | `/funil`, detalhe da EJ, `/agenda` | registrar interação com próximo passo → tarefa aparece na agenda; arrastar card no kanban |
| 4 Score de ICP | badge A/B/C/D, card "Score de ICP" no detalhe, `/configuracoes/score`, "Prioridades da semana" na agenda | mudar um peso e salvar → recálculo em fila |
| 5 Templates e cadências | `/templates`, `/cadencias`, seção "Cadências" na EJ, "Gerar mensagem" na agenda | inscrever uma EJ → tarefa do passo → gerar mensagem → copiar/abrir WhatsApp ou e-mail → marcar como enviada. **Nada é enviado automaticamente** |
| 6 Dashboard e gamificação | `/dashboard`, `/configuracoes/metas` | trocar período; ver ranking, barra de meta e conquistas |
| 7 LGPD, auditoria, segurança | contatos (opt-out, exportar, anonimizar), `/configuracoes/auditoria`, `/configuracoes/lgpd`, `/politica-de-dados` | marcar opt-out (motivo obrigatório) → links somem; filtrar a auditoria por ação |

## LGPD

- **Opt-out** bloqueia o contato em toda a plataforma (mensagens, links, inscrição em cadência, importação). Marcar exige
  motivo, grava data, `HistoricoOptOut` (append-only), encerra cadências e cancela tarefas do contato. Só GESTOR/ADMIN desmarcam.
- **Lista de supressão**: e-mails/telefones em opt-out ou anonimizados ficam só como hash HMAC (`SUPRESSAO_PEPPER`);
  impede recriar o contato à mão ou por importação. Depois de um deploy ou troca de pepper: `POST /lgpd/supressao/backfill` (ADMIN, botão em `/configuracoes/lgpd`).
- **Direitos do titular**: `GET /contatos/:id/exportar` (JSON) e `POST /contatos/:id/anonimizar` (definitivo), GESTOR/ADMIN, ambos auditados.
- **Retenção**: nada é apagado automaticamente. `/configuracoes/lgpd` lista contatos com mandato encerrado há mais de 24 meses
  e sem interação há 24 meses; o ADMIN revisa e anonimiza. Detalhes em `docs/base-ejs.md` e na página `/politica-de-dados`.
- **Pendente**: preencher o e-mail do encarregado (DPO) em `/politica-de-dados` (está como `[preencher]`).

## Backup do banco

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U orcestra -d orcestra_prospect -Fc > backups/orcestra_$(date +%Y%m%d_%H%M).dump
```

Restaurar (em banco vazio): `docker compose exec -T postgres pg_restore -U orcestra -d orcestra_prospect --clean --if-exists < backups/<arquivo>.dump`.
Faça backup antes de qualquer operação destrutiva. `backups/` fica fora do git.

## Testes

```bash
pnpm test        # Vitest (shared: normalizador, score, cadências, templates) + Jest (API: auth, permissões, etapas 3–7)
pnpm --filter @orcestra/web exec playwright test --workers=1   # 23 e2e; stack no ar (docker compose)
```

Os e2e criam e apagam os próprios dados (`QA TESTE …`), inclusive as supressões dos contatos de teste
(`apps/web/e2e/supressao.ts`). `jornada.spec.ts` cobre login → filtrar EJ → registrar interação → mover no kanban → dashboard.
Em máquinas com pouca RAM (~10 GB), rode builds e Playwright sozinhos e com `--workers=1`.

## Design

Identidade da Orc'estra Gamificação (`brand/paleta.md`): escala `--brand-50..950` em oklch no topo de
`apps/web/src/app/globals.css`, derivada de `#014E18` (primária, `brand-700`; no escuro `brand-400`), `#003D0D`
(`brand-800`, fundo do logo), `#FFFBDC` (`--brand-cream`, texto sobre verde) e `#2EB600` (`brand-500`, destaque:
conquistas e meta batida). Cores só por tokens, nada hardcoded. Texto normal com contraste AA (>= 4.5:1) nos dois temas.
Modo claro/escuro (segue o sistema, com alternância no topo) e layout responsivo. O componente `Logo` usa
`apps/web/public/brand/` (logo completa na sidebar e no login; ícone + "Prospect" no topo em telas estreitas).

## Documentação

| Arquivo | Conteúdo |
| --- | --- |
| [`docs/comandos.md`](docs/comandos.md) | todos os comandos (Docker, testes, E2E, banco) |
| [`docs/arquitetura.md`](docs/arquitetura.md) | auth, proxy, banco, testes |
| [`docs/base-ejs.md`](docs/base-ejs.md) | coletor, fontes, verificação de sites, LGPD da base |
| [`docs/decisoes.md`](docs/decisoes.md) | decisões de projeto por etapa |
| [`docs/compartilhar.md`](docs/compartilhar.md) | link público temporário (Cloudflare Tunnel) |
| [`docs/tamanho-arquivos.md`](docs/tamanho-arquivos.md) | arquivos grandes e divisões sugeridas |
| [`brand/paleta.md`](brand/paleta.md) | cores e logo |
