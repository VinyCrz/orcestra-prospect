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
| Swagger     | http://localhost:3001/docs                                                 |
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
- Papéis: **ADMIN** (gestão de usuários), **GESTOR**, **SDR**. Nesta etapa GESTOR e SDR têm o mesmo acesso
  de leitura à base; as diferenças entram nas próximas etapas.
- "Esqueci minha senha": gera token de uso único (1 h) e **registra o link no log da API**
  (`docker compose logs api | grep esqueci`). A resposta é idêntica exista ou não o e-mail.
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

## Testes

```bash
pnpm test        # 23 testes do normalizador/deduplicador/LGPD + 23 do auth (login, refresh, guards de papel)
pnpm test:e2e    # login → lista de EJs → filtro por UF → detalhe (stack precisa estar no ar)
```

## Design

Tokens de marca em CSS variables no topo de `apps/web/src/app/globals.css` (`--brand-*`): troque ali
as cores da Orce'estra. Modo claro/escuro (segue o sistema, com alternância no topo) e layout responsivo.

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
