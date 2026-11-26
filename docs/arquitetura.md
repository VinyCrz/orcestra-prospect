# Arquitetura

## Stack

- **Front** (`apps/web`): Next.js 15 App Router, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query/Table, React Hook Form + Zod.
- **API** (`apps/api`): NestJS 11, Prisma 6, PostgreSQL 16, Swagger em `/docs`, Redis 7 + BullMQ (filas registradas: `enriquecimento`, `cadencias`, `importacoes`; sem workers ainda).
- **Compartilhado** (`packages/shared`): enums, tipos, schemas Zod, normalizador e deduplicador da base.
- **Coletor** (`scripts/coleta`): coletor reexecutável da base de EJs (ver `docs/base-ejs.md`).
- Versões fixadas em majors estáveis (Next 15.5, Nest 11, Prisma 6, Zod 3, ESLint 9, TanStack Table 8).

## Autenticação

- Senhas com argon2id (`apps/api/src/auth/senha.service.ts`).
- Access token JWT de 15 min, em memória no front, enviado como `Bearer`.
- Refresh token opaco de 7 dias em cookie `httpOnly`, `SameSite=Strict` (`Secure` com `COOKIE_SECURE=true`). No banco fica só o hash SHA-256. Cada uso rotaciona o token; reuso de token revogado derruba todas as sessões do usuário.
- Guards globais: `JwtAuthGuard` (exige token e usuário ativo) e `RolesGuard` (`@Papeis(...)`). Rotas públicas: `@Public()`.
- Papéis: ADMIN (gestão de usuários), GESTOR, SDR. Nesta etapa GESTOR e SDR só leem a base.
- "Esqueci minha senha": token de uso único com validade de 1 h; o link vai para o log da API (resposta igual exista ou não o e-mail). Em produção (`NODE_ENV=production`) o link não é logado, então hoje só o ADMIN troca senhas.
- Autocadastro (`/cadastro`): a pessoa cria a própria conta como **SDR** com o **código da equipe**. O ADMIN define, troca ou fecha o código no card "Código da equipe" em Usuários. O código fica só como hash argon2 em `config_sistema` (linha única); sem código, o cadastro está fechado. O código é conferido antes do e-mail (não dá para descobrir quem tem conta sem ele) e a rota tem limite só por IP (`RATE_LIMIT_CADASTRO_POR_MIN`, padrão 5/min). Audit: `USUARIO_AUTOCADASTRO`, `AUTOCADASTRO_RECUSADO`, `CODIGO_CADASTRO_DEFINIDO`, `CADASTRO_FECHADO`.
- Front: `apps/web/src/middleware.ts` redireciona para `/login` sem cookie; o layout logado valida sessão e papel (a API valida de novo).

## Proxy e CORS

O navegador só fala com a origem do front. `apps/web/src/app/api/[...path]/route.ts` repassa `/api/*` para `API_INTERNAL_URL` (lida em runtime). Isso permite cookie `SameSite=Strict` sem CORS com credenciais.

## Validação e padrões da API

- Schemas Zod ficam em `packages/shared/src/schemas.ts` e são reaproveitados pelo front.
- `ZodValidationPipe` (`apps/api/src/common/zod-validation.pipe.ts`) valida o body/query nas rotas.
- DTOs com `@ApiProperty` servem só para o Swagger.
- Mudanças relevantes gravam `AuditLog`.
- Regra de carteira: SDR só edita EJs atribuídas a ele (aplicar em toda rota de escrita nas próximas etapas).

## Banco de dados

Schema em `apps/api/prisma/schema.prisma` com: `Usuario`, `Federacao`, `Nucleo`, `Ies`, `EmpresaJunior`, `Contato`, `Interacao`, `Tarefa`, `Cadencia`, `PassoCadencia`, `TemplateMensagem`, `Tag`, `ListaSalva`, `Importacao`, `AuditLog`, `RefreshToken`, `TokenRedefinicaoSenha`.

- `EmpresaJunior.chaveDedupe` (CNPJ, ou nome+IES+UF normalizados) garante seed idempotente.
- Migrations em `apps/api/prisma/migrations/` (nunca editar migration já aplicada).
- A imagem da API roda `prisma migrate deploy` ao subir; o seed é manual.
- O seed não sobrescreve campos de trabalho comercial (status, score, responsável, observações, verificado).

## Testes

- Shared: Vitest, `packages/shared/src/normalize.test.ts`.
- API: Jest + ts-jest, `apps/api/test/*.spec.ts` (auth service e guards de papel).
- Web: só Playwright, `apps/web/e2e/`.

## Decisões de produto relevantes

- Federação só quando confirmada pela própria federação (FEJERS ou RioJunior); nunca deduzida pela UF.
- EJs com CNPJ BAIXADO ou NULO são excluídas da base; INAPTA/SUSPENSA são mantidas e exibidas.
- `verificado = false` para toda EJ coletada; `federada` só `true` quando a federação lista a EJ.
- Papéis GESTOR e SDR têm o mesmo acesso nesta etapa. Um ADMIN não pode desativar nem rebaixar a si mesmo, e deve sempre existir ao menos um ADMIN ativo.
- Fonte do sistema (Inter/system-ui), sem `next/font/google`, para o build não depender de rede.
- Tokens de marca em CSS variables no topo de `apps/web/src/app/globals.css` (`--brand-*`).
