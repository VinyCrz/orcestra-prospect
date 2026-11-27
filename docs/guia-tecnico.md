# Guia técnico

Detalhes para quem vai rodar, manter ou auditar o projeto. A visão geral está no [README](../README.md).

## Sumário

- [Scripts](#scripts-raiz) · [Autenticação e segurança](#autenticação) · [Banco de dados](#banco-de-dados)
- [Variáveis de ambiente](#variáveis-de-ambiente) · [Papéis e permissões](#papéis-e-permissões)
- [Funcionalidades por etapa](#funcionalidades-e-como-testar) · [LGPD](#lgpd) · [Backup](#backup-do-banco)
- [Testes](#testes) · [Design](#design)

## Scripts (raiz)

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

## Autenticação

- Senhas com **argon2id**.
- **Access token JWT** (15 min, em memória no front, enviado como `Bearer`).
- **Refresh token** opaco (7 dias) em cookie `httpOnly`, `SameSite=Strict` (`Secure` em produção via
  `COOKIE_SECURE=true`). No banco fica só o **hash SHA-256**. A cada uso o token é **rotacionado**; reuso
  de um token já revogado derruba todas as sessões do usuário.
- Guards globais: `JwtAuthGuard` (exige token e usuário **ativo** — desativar um usuário corta o acesso
  imediatamente) e `RolesGuard` (`@Papeis('ADMIN')`). Rotas públicas usam `@Public()`.
- Papéis: ver **Papéis e permissões** abaixo.
- Senhas: mínimo 10 caracteres com letra, número e símbolo (`senhaSchema` do shared, usado na API, no front e no seed).
- **Rate limit** (`@nestjs/throttler`): login 5/min por IP+e-mail; cadastro 30/min por IP; refresh, esqueci e redefinir senha 60/min por IP
  (`RATE_LIMIT_LOGIN_POR_MIN` / `RATE_LIMIT_AUTH_POR_MIN` / `RATE_LIMIT_CADASTRO_POR_MIN`; os limites por IP são folgados porque a equipe costuma estar no mesmo Wi-Fi). Acima disso, 429 com mensagem em pt-BR.
- `helmet`, `trust proxy` = 1 (o proxy do web sobrescreve `X-Forwarded-For`), CORS desligado por padrão.
- Login com sucesso e falha vão para o AuditLog (`LOGIN_OK` / `LOGIN_FALHOU`, e-mail mascarado), com IP.
- Senha esquecida: não há envio de e-mail. O ADMIN gera em **Usuários** um link de uso único (24 h) e manda
  para a pessoa (botão de WhatsApp). Em desenvolvimento, a rota `/auth/esqueci-senha` ainda grava o link no log.
- Autocadastro em `/cadastro` com o código da equipe (definido pelo ADMIN em Usuários); a conta entra como SDR.
- Front: o `middleware` redireciona para `/login` quando não há cookie de sessão; o layout logado valida a
  sessão e o papel (a API valida de novo).

## Banco de dados

O schema já contém todas as entidades previstas: `Usuario`, `Federacao`, `Nucleo`, `Ies`, `EmpresaJunior`,
`Contato`, `Interacao`, `Tarefa`, `Cadencia`, `PassoCadencia`, `TemplateMensagem`, `Tag`, `ListaSalva`,
`Importacao`, `AuditLog` (+ `RefreshToken` e `TokenRedefinicaoSenha` para o auth).
`EmpresaJunior.chaveDedupe` (CNPJ ou nome+IES+UF normalizados) garante seed idempotente.

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
| `RATE_LIMIT_LOGIN_POR_MIN`, `RATE_LIMIT_AUTH_POR_MIN` | rate limit (padrão 5 e 60). para rodar a suíte Playwright, suba temporariamente para 30 e 120 |
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
