# Decisões de projeto

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

## Etapa 2 — gestão da base e importação

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

## Etapa 3 — interações, tarefas e funil (back-end)

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

## Etapa 4 — score de ICP

- **Cálculo puro em `packages/shared/src/score.ts`** (usado pela API e pela prévia do front): score = 100 × pontos ÷ soma dos
  pesos ativos; critério sem dado vale 0 com motivo "sem dado". Faixas por limiares configuráveis (padrão A ≥ 75, B ≥ 50, C ≥ 25).
- Recálculo em fila BullMQ `score`, em lotes, só das EJs com versão de score desatualizada; recálculo unitário ao editar EJ,
  contatos, tags e ao registrar interação. No boot, EJs nunca calculadas são enfileiradas.
- Com a base atual (pouca informação de membros, decisores e interações) nenhuma EJ fica em A/B — ajuste pesos/limiares em
  `/configuracoes/score` ou enriqueça a base.

## Etapa 5 — cadências e templates

- Inscrição em lote (até 500 EJs) numa transação; ignora EJ fora da carteira (SDR), PERDIDA, já avançada no funil, já inscrita
  ou com contato em opt-out. Tarefas com origem CADENCIA vencem em hoje (SP) + dia do passo.
- Cadência encerra sozinha por **resposta** (RESPONDEU, REUNIAO_MARCADA, NAO_INTERESSADO), **avanço no funil** além de
  PRIMEIRO_CONTATO ou **opt-out**; tarefas pendentes são canceladas (`concluida = true` + `canceladaEm`; métricas ignoram canceladas).
- "Gerar mensagem" só monta o texto e os links `wa.me`/`mailto` (com `encodeURIComponent`); registrar o envio é manual.
- Criar/editar cadência só ADMIN; templates ADMIN/GESTOR. 3 templates e 1 cadência iniciais no seed (não sobrescritos).

## Etapa 6 — dashboard e gamificação

- Métricas 100% agregadas no banco (`$queryRaw` parametrizado) com índices dedicados. Funil conta EJs que alcançaram cada etapa
  no período (pular etapa conta como passar por ela). Tempo por etapa usa `HistoricoStatus` (EJs sem histórico ficam de fora).
- SDR vê só os próprios números; para ele EJs por UF e cobertura usam a carteira dele.
- Metas semanais: padrão global + override por SDR, versionadas por semana (semanas passadas usam a meta da época).
  "Reunião" = interação com resultado REUNIAO_MARCADA. Ranking: pontos = interações + 5 × reuniões.
- Conquistas concedidas de forma idempotente após o commit (falha só gera log); "semana com meta batida" por job toda segunda 03:00 (SP).
- Gráficos com Recharts 2.15.4 e tokens `--chart-*`; o pós-login continua indo para `/empresas-juniores`.

## Etapa 7 — LGPD, auditoria e segurança

- Ver seções **LGPD**, **Autenticação** e **Papéis**. AuditLog grava IP via AsyncLocalStorage; tela `/configuracoes/auditoria` (ADMIN).
- Anonimizar limpa nome, e-mail, telefones, LinkedIn, cargo descritivo, mandato e motivo de opt-out; **não** limpa texto livre já
  escrito em resumos de interação (orientação: não registrar dados pessoais em texto livre).
- Swagger desligado em produção; `docker-compose.yml` mantém senhas padrão de dev — em produção defina todas as variáveis.

## Fase 3 — marca

- Paleta e logo recebidos em 22/11/2026 e aplicados (tokens, `Logo`, favicon, theme-color). **Pendente:** versão maior ou
  SVG da logo (a enviada tem 378x159 e pode serrilhar em telas grandes/retina); fonte pixel da marca não usada na interface.

## Ajustes pós-etapa 7 (pedido do usuário, 22/11/2026)

- **Só EJs com alguma forma de contato aparecem no sistema.** As demais (1.351 de 1.515 na base atual) ficam **ocultas, não
  apagadas**. A coluna `empresas_juniores.temContato` é mantida por triggers do PostgreSQL (migration `ej_tem_contato`):
  true se a EJ tem site, Instagram, LinkedIn, Facebook, e-mail ou telefone institucional, ou um contato fora de opt-out/anonimização
  com e-mail, telefone, WhatsApp ou LinkedIn. Lista, CSV, filtros, ações em massa, carteira, kanban, prioridades, cadências, alertas
  e métricas de base do dashboard usam só EJs visíveis (`EJ_VISIVEL` em `apps/api/src/empresas-juniores/visibilidade.ts`);
  métricas de atividade do SDR (interações, ranking, metas) contam tudo. O detalhe por id continua acessível e mostra o aviso
  "EJ oculta"; cadastrar um canal ou contato faz a EJ reaparecer sozinha. A deduplicação (importação, cadastro manual, seed)
  considera também as ocultas, para não recriá-las.
- **A página da EJ não mostra mais a fonte dos dados** (`fonteUrl`, `fontes`, `coletadoEm` continuam no banco para rastreabilidade/LGPD).
