# Orce'estra Prospect

Plataforma interna de **prospecção B2B** da Orce'estra Gamificação, focada em Empresas Juniores (EJs)
do Movimento Empresa Júnior / Brasil Júnior. Esta é a **Etapa 1**: infraestrutura, autenticação,
schema completo do banco, base real de EJs e a tela mínima de consulta.

## Stack

| Camada        | Tecnologias                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Monorepo      | pnpm workspaces — `apps/web`, `apps/api`, `packages/shared`, `scripts/coleta`                                            |
| Front         | Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Query/Table · React Hook Form · Zod |
| Back          | NestJS 11 · Prisma 6 · PostgreSQL 16 · Swagger em `/docs` · Redis 7 + BullMQ (filas registradas para as próximas etapas) |
| Compartilhado | `@orcestra/shared`: enums, tipos, schemas Zod, normalizador e deduplicador                                               |
| Testes        | Vitest (shared) · Jest (API) · Playwright (E2E)                                                                          |

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

Veja **`data/RELATORIO.md`** para totais por UF/federação, fontes e lacunas.

**Como a base é montada** (`scripts/coleta`):

1. **FEJERS** — a página pública https://www.fejers.org.br/empresas-juniores consome a API pública
   `api.fejers.org.br/junior-enterprises`, que traz as EJs do RS com detalhes (IES, cursos, áreas, serviços,
   cidade, canais) e também o **cadastro nacional da rede** (nome, CNPJ e ID Brasil Júnior) de EJs de todo o país.
2. **RioJunior** — página pública "As Empresas Juniores" (nome + site/Instagram) e a API REST pública do
   WordPress do site (áreas e serviços).
3. **Receita Federal (CNPJ, dado público)** via BrasilAPI (fallback minhareceita.org): razão social, município,
   UF, data de abertura e situação cadastral. É o que permite localizar as EJs de todas as UFs.
4. **IBGE (API pública de localidades)**: grafia oficial das cidades (a Receita grava sem acentos).
5. Normalização (UF, cidade, nome de IES, URLs, Instagram, CNPJ com dígito verificador) e deduplicação
   (CNPJ; senão nome normalizado + IES + UF) — código em `packages/shared/src/normalize.ts`, com testes.

**Regras seguidas:** apenas fontes públicas e sem login; robots.txt respeitado; intervalo mínimo de 1,2 s por
host com backoff em 429/5xx; User-Agent genérico; cache local para não repetir requisições; nada inventado
(campo não confirmado = `null`); toda EJ tem `fonteUrl` e `coletadoEm`.

**LGPD:** só dados da organização. Do CNPJ guardamos apenas campos da empresa — quadro societário, e-mail e
telefone da Receita são descartados (nem vão para o cache). E-mails/telefones publicados pelas federações só
são mantidos quando claramente institucionais (e-mail com o nome da EJ ou termo como `contato@`; telefone
fixo — celulares são descartados). A tabela `Contato` fica vazia.

Para atualizar: `pnpm coleta` (usa cache; `--atualizar` ignora o cache das páginas,
`--limite-cnpj=N` limita consultas novas) e depois `pnpm db:seed`. O seed **não sobrescreve** campos de
trabalho comercial (status, score, responsável, observações, verificado).

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
| `RATE_LIMIT_LOGIN_POR_MIN`, `RATE_LIMIT_AUTH_POR_MIN` | rate limit (padrão 5 e 10). No `.env` de dev desta máquina estão em 30 e 120 porque a suíte Playwright faz muitos logins/refresh por minuto |
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
sg docker -c "docker compose exec -T postgres pg_dump -U orcestra -d orcestra_prospect -Fc" > backups/orcestra_$(date +%Y%m%d_%H%M).dump
```

Restaurar (em banco vazio): `sg docker -c "docker compose exec -T postgres pg_restore -U orcestra -d orcestra_prospect --clean --if-exists" < backups/<arquivo>.dump`.
Faça backup antes de qualquer operação destrutiva. `backups/` fica fora do git.

## Testes

```bash
pnpm test        # Vitest (shared: normalizador, score, cadências, templates) + Jest (API: auth, permissões, etapas 3–7)
pnpm --filter @orcestra/web exec playwright test --workers=1   # 23 e2e; stack no ar (docker compose)
```

Os e2e criam e apagam os próprios dados (`QA TESTE …`), inclusive as supressões dos contatos de teste
(`apps/web/e2e/supressao.ts`). `jornada.spec.ts` cobre login → filtrar EJ → registrar interação → mover no kanban → dashboard.
**Nesta máquina (~10 GB RAM)** rode builds e Playwright sozinhos e com `--workers=1` (ver `CLAUDE.md`).

## Design

Identidade da Orc'estra Gamificação (`brand/paleta.md`): escala `--brand-50..950` em oklch no topo de
`apps/web/src/app/globals.css`, derivada de `#014E18` (primária, `brand-700`; no escuro `brand-400`), `#003D0D`
(`brand-800`, fundo do logo), `#FFFBDC` (`--brand-cream`, texto sobre verde) e `#2EB600` (`brand-500`, destaque:
conquistas e meta batida). Cores só por tokens, nada hardcoded. Texto normal com contraste AA (>= 4.5:1) nos dois temas.
Modo claro/escuro (segue o sistema, com alternância no topo) e layout responsivo. O componente `Logo` usa
`apps/web/public/brand/` (logo completa na sidebar e no login; ícone + "Prospect" no topo em telas estreitas).

## Decisões

- **Retenção da importação (LGPD):** a planilha enviada (`importacoes_arquivos`) é apagada assim que a importação
  termina (CONCLUIDA ou FALHOU). O relatório de erros guarda só nº da linha, campo e mensagem (valores entre
  aspas de contatos são omitidos), sem os valores originais; o `erros.csv` traz apenas essas três colunas.
  Contatos importados geram `AuditLog` (`CONTATO_CRIADO`/`CONTATO_EDITADO`) com dados pessoais mascarados; a base
  legal pode vir de uma coluna da planilha (padrão `LEGITIMO_INTERESSE_B2B`). Observações da EJ no `AuditLog`
  gravam apenas "alterado".
- **Leitura de contatos pelo SDR:** SDR continua podendo LER contatos de qualquer EJ (regra "SDR vê tudo"),
  mas só edita os da sua carteira. A exportação CSV da lista de EJs não inclui contatos.
- **Versões fixadas em majors estáveis** (TypeScript 5.9, Next 15.5, NestJS 11, Prisma 6, Zod 3, ESLint 9,
  TanStack Table 8) em vez dos majors mais recentes, para reduzir risco de incompatibilidade entre
  ferramentas (decorators do Nest, geração do Prisma, resolvers do RHF).
- **Proxy `/api/*` no Next** (route handler, URL da API lida em runtime via `API_INTERNAL_URL`): o navegador
  fala só com a origem do front, o que permite cookie `SameSite=Strict` sem CORS com credenciais.
- **Access token em memória** (não em localStorage) + refresh em cookie httpOnly com rotação e detecção de reuso.
- **Validação com os schemas Zod do `@orcestra/shared`** num `ZodValidationPipe`, reaproveitados no front
  (React Hook Form). DTOs com `@ApiProperty` existem só para documentar o Swagger.
- **Fonte principal da base nacional**: o cadastro da rede exposto publicamente pela API do site da FEJERS
  (nome + CNPJ + ID Brasil Júnior). O site da Brasil Júnior não publica diretório de EJs, e a maioria das
  federações não tem lista estruturada acessível (Wix/Flutter sem dados no HTML ou sites fora do ar).
- **Federação só quando confirmada pela própria federação** (FEJERS e RioJunior). Não deduzimos a federação
  pela UF, para não inventar dados; o filtro "Sem federação confirmada" mostra o restante.
- **IES extraída da razão social** registrada na Receita quando ela cita literalmente a instituição
  (ex.: "… JÚNIOR DA UNIVERSIDADE ESTADUAL DE LONDRINA"); caso contrário fica vazia.
- **Grafia de cidades pelo IBGE e acentos em nomes de IES**: a Receita registra tudo em caixa alta e sem
  acento. Cidades são trocadas pelo nome oficial do IBGE (mesma UF); em nomes de IES restauramos acentos
  só de palavras com grafia inequívoca (dicionário em `normalize.ts`), removemos sufixos de campus e siglas
  repetidas. Nada além da grafia é alterado.
- **Ano de fundação = ano de abertura do CNPJ.**
- **EJs com CNPJ BAIXADO ou NULO são excluídas** da base (organização encerrada). Situações INAPTA/SUSPENSA
  são mantidas e exibidas no detalhe.
- **`verificado = false`** para todas as EJs: ainda não houve verificação humana.
- **`federada`** é `true` só quando a federação lista a EJ; nos demais casos `false` (não confirmado).
- **Núcleo e nº de membros** ficam vazios: nenhuma fonte usada publica esses dados de forma estruturada.
- **Papéis GESTOR e SDR** têm o mesmo acesso nesta etapa (só leitura da base); ADMIN gerencia usuários. Um
  ADMIN não pode desativar/rebaixar a si mesmo, e o sistema mantém sempre pelo menos um ADMIN ativo.
- **Imagem da API roda `prisma migrate deploy` ao subir**; o seed é manual (`docker compose exec api pnpm db:seed`)
  para não recarregar a base a cada restart. Os arquivos `data/ejs.json` e `data/federacoes.json` são
  copiados para a imagem.
- **Fonte do sistema** (stack Inter/system-ui) em vez de `next/font/google`, para o build não depender de rede.
- **BullMQ**: conexão e filas (`enriquecimento`, `cadencias`, `importacoes`) registradas; o healthcheck
  verifica o Redis. Nenhum worker nesta etapa.

### Etapa 2 — gestão da base e importação

- **Quem importa CSV/XLSX**: somente ADMIN e GESTOR. A importação altera a base compartilhada em lote (e pode
  mesclar dados de EJs que outros SDRs trabalham); SDR continua editando individualmente as EJs da sua carteira.
- **SDR e cadastro manual**: SDR pode cadastrar EJ, que já nasce na carteira dele (senão ele não poderia editá-la).
  Só GESTOR/ADMIN atribuem responsável (individual, em massa ou por rodízio).
- **Mesclar vs. ignorar**: MESCLAR preenche apenas campos vazios e une tags/serviços; nunca sobrescreve valor existente,
  nem status, responsável, score, verificado ou `federada`. Duplicidade = CNPJ ou nome normalizado + IES + UF
  (nome+UF também casa EJ com CNPJ quando a IES é compatível); contatos: e-mail (ou nome) dentro da mesma EJ.
- **Processamento da importação**: fila BullMQ `importacoes` (worker no próprio processo da API), lotes de 200 linhas,
  cada lote numa transação junto com o checkpoint (`processadas`); se um lote falhar, é reprocessado linha a linha.
  Reprocessar nunca duplica (as linhas já criadas viram "duplicadas"). Federação inexistente na linha vira erro da linha.
- **Ações em massa** limitadas a 5.000 EJs; distribuição de carteira a 20.000. AuditLog por EJ alterada.
- **Exportação CSV**: UTF-8 com BOM, separador `;` (Excel pt-BR), células iniciadas por `= + - @` recebem `'`.
- **AuditLog de contatos**: nome, e-mail, telefone e WhatsApp são mascarados (ex.: `jo***@dominio.com`).

### Etapa 3 — interações, tarefas e funil (back-end)

- **Mudança de status centralizada** (`StatusService`): usada pelo `PATCH /empresas-juniores/:id` (campos `statusProspeccao`,
  `motivoPerdaId`, `motivoPerdaDetalhe`, `dataRetornoNutricao`), pela ação em massa `MUDAR_STATUS` e pelo kanban
  (`PATCH /empresas-juniores/:id/status`). PERDIDA exige motivo ativo e NUTRICAO exige data de retorno (400); ao sair
  desses status os campos são limpos. Grava `HistoricoStatus`, `statusAlteradoEm` e `AuditLog` `EJ_STATUS_ALTERADO`
  (sem o texto do detalhe). Criar EJ já como PERDIDA/NUTRICAO é recusado (crie e depois mude o status).
- **Kanban**: `GET /funil/kanban` devolve por coluna `total` + primeiros `limite` cards (padrão 20, máx. 50), ordenados
  por score; paginação por coluna com `?status=X&cursor=<proximoCursor>`. Filtros: `responsavelId` (aceita `eu`/`nenhum`), `uf`, `busca`.
- **Motivos de perda**: leitura para todos; criar/editar só ADMIN; não há exclusão (desativa-se, pois há FK `Restrict`).
- **Interações**: SDR registra interação só nas EJs da própria carteira (mesma regra de edição); GESTOR/ADMIN em qualquer
  uma. Editar/excluir: autor, GESTOR ou ADMIN. Contato em opt-out ou anonimizado = 422. O `resumo` não vai para o AuditLog.
  **O status NÃO muda automaticamente**: se a EJ está em NAO_TRABALHADA/PESQUISADA a resposta traz `sugestaoStatus`
  (PRIMEIRO_CONTATO) e o front decide se oferece a mudança.
- **Linha do tempo**: `GET /empresas-juniores/:id/timeline` une interações, histórico de status, AuditLog da EJ e dos contatos
  (já mascarado), tarefas criadas e concluídas.
- **Tarefas**: agenda e contador usam o dia civil de America/Sao_Paulo (UTC-3 fixo, sem horário de verão). Data sem hora
  vale o início do dia em SP. `adiar` com `dias` soma a max(vencimento, hoje). SDR só vê/cria tarefas para si.
- **Alertas diários** (fila BullMQ `alertas`, job repetível 06:00 America/Sao_Paulo; `POST /alertas/executar` só ADMIN):
  mandato terminando em até 30 dias -> `MANDATO_VENCENDO` (vencimento = min(fim do mandato, hoje+7)); EJ em NUTRICAO com retorno
  em até 3 dias ou atrasado -> `NUTRICAO_RETORNO` (vencimento = data de retorno). Tarefa vai para o responsável da EJ; sem
  responsável (ou inativo) é pulada e contada em `semResponsavel`. Idempotência por `chaveIdempotencia` única
  (`mandato:<contatoId>:<fim>` / `nutricao:<ejId>:<data>`) com `createMany skipDuplicates`.

### Etapa 4 — score de ICP

- **Cálculo puro em `packages/shared/src/score.ts`** (usado pela API e pela prévia do front): score = 100 × pontos ÷ soma dos
  pesos ativos; critério sem dado vale 0 com motivo "sem dado". Faixas por limiares configuráveis (padrão A ≥ 75, B ≥ 50, C ≥ 25).
- Recálculo em fila BullMQ `score`, em lotes, só das EJs com versão de score desatualizada; recálculo unitário ao editar EJ,
  contatos, tags e ao registrar interação. No boot, EJs nunca calculadas são enfileiradas.
- Com a base atual (pouca informação de membros, decisores e interações) nenhuma EJ fica em A/B — ajuste pesos/limiares em
  `/configuracoes/score` ou enriqueça a base.

### Etapa 5 — cadências e templates

- Inscrição em lote (até 500 EJs) numa transação; ignora EJ fora da carteira (SDR), PERDIDA, já avançada no funil, já inscrita
  ou com contato em opt-out. Tarefas com origem CADENCIA vencem em hoje (SP) + dia do passo.
- Cadência encerra sozinha por **resposta** (RESPONDEU, REUNIAO_MARCADA, NAO_INTERESSADO), **avanço no funil** além de
  PRIMEIRO_CONTATO ou **opt-out**; tarefas pendentes são canceladas (`concluida = true` + `canceladaEm`; métricas ignoram canceladas).
- "Gerar mensagem" só monta o texto e os links `wa.me`/`mailto` (com `encodeURIComponent`); registrar o envio é manual.
- Criar/editar cadência só ADMIN; templates ADMIN/GESTOR. 3 templates e 1 cadência iniciais no seed (não sobrescritos).

### Etapa 6 — dashboard e gamificação

- Métricas 100% agregadas no banco (`$queryRaw` parametrizado) com índices dedicados. Funil conta EJs que alcançaram cada etapa
  no período (pular etapa conta como passar por ela). Tempo por etapa usa `HistoricoStatus` (EJs sem histórico ficam de fora).
- SDR vê só os próprios números; para ele EJs por UF e cobertura usam a carteira dele.
- Metas semanais: padrão global + override por SDR, versionadas por semana (semanas passadas usam a meta da época).
  "Reunião" = interação com resultado REUNIAO_MARCADA. Ranking: pontos = interações + 5 × reuniões.
- Conquistas concedidas de forma idempotente após o commit (falha só gera log); "semana com meta batida" por job toda segunda 03:00 (SP).
- Gráficos com Recharts 2.15.4 e tokens `--chart-*`; o pós-login continua indo para `/empresas-juniores`.

### Etapa 7 — LGPD, auditoria e segurança

- Ver seções **LGPD**, **Autenticação** e **Papéis**. AuditLog grava IP via AsyncLocalStorage; tela `/configuracoes/auditoria` (ADMIN).
- Anonimizar limpa nome, e-mail, telefones, LinkedIn, cargo descritivo, mandato e motivo de opt-out; **não** limpa texto livre já
  escrito em resumos de interação (orientação: não registrar dados pessoais em texto livre).
- Swagger desligado em produção; `docker-compose.yml` mantém senhas padrão de dev — em produção defina todas as variáveis.

### Fase 3 — marca

- Paleta e logo recebidos em 22/11/2026 e aplicados (tokens, `Logo`, favicon, theme-color). **Pendente:** versão maior ou
  SVG da logo (a enviada tem 378x159 e pode serrilhar em telas grandes/retina); fonte pixel da marca não usada na interface.

### Ajustes pós-etapa 7 (pedido do usuário, 22/11/2026)

- **Só EJs com alguma forma de contato aparecem no sistema.** As demais (1.351 de 1.515 na base atual) ficam **ocultas, não
  apagadas**. A coluna `empresas_juniores.temContato` é mantida por triggers do PostgreSQL (migration `ej_tem_contato`):
  true se a EJ tem site, Instagram, LinkedIn, Facebook, e-mail ou telefone institucional, ou um contato fora de opt-out/anonimização
  com e-mail, telefone, WhatsApp ou LinkedIn. Lista, CSV, filtros, ações em massa, carteira, kanban, prioridades, cadências, alertas
  e métricas de base do dashboard usam só EJs visíveis (`EJ_VISIVEL` em `apps/api/src/empresas-juniores/visibilidade.ts`);
  métricas de atividade do SDR (interações, ranking, metas) contam tudo. O detalhe por id continua acessível e mostra o aviso
  "EJ oculta"; cadastrar um canal ou contato faz a EJ reaparecer sozinha. A deduplicação (importação, cadastro manual, seed)
  considera também as ocultas, para não recriá-las.
- **A página da EJ não mostra mais a fonte dos dados** (`fonteUrl`, `fontes`, `coletadoEm` continuam no banco para rastreabilidade/LGPD).

## Compartilhar com link público (temporário)

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
