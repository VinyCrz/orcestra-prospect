# Arquivos grandes (código-fonte)

Levantamento feito com `wc -l` em `apps/*`, `packages/*` e `scripts/*` (sem `node_modules`, `dist`, `.next`).
Critério: mais de 500 linhas. Nenhuma divisão foi feita; abaixo, sugestões.

## Acima de 500 linhas

| Arquivo | Linhas | Sugestão de divisão |
| --- | --- | --- |
| `packages/shared/src/normalize.ts` | 604 | Quebrar em `normalize/` com um módulo por tema, mantendo `normalize/index.ts` reexportando tudo (assim `packages/shared/src/index.ts` não muda). Sugestão: `texto.ts` (removerAcentos, limparEspacos, chaveNome, titleCasePtBr), `uf-cidade.ts` (normalizarUf, regiaoDaUf, normalizarCidade), `ies.ts` (SIGLAS_IES_COMUNS, SIGLAS_IES_CONHECIDAS, restaurarAcentos, normalizarNomeIes, extrairIesDaRazaoSocial, extrairSiglaIes), `cnpj.ts` (cnpjValido, normalizarCnpj, formatarCnpj), `contato.ts` (URL, Instagram, e-mail/telefone, emailInstitucional, telefoneInstitucional), `dedupe.ts` (chaveDedupe, mesclarEj, deduplicarEjs). Os testes em `normalize.test.ts` (258 linhas) podem seguir o mesmo corte. |

## Perto do limite (300 a 500 linhas), vigiar

| Arquivo | Linhas |
| --- | --- |
| `apps/web/src/app/(app)/empresas-juniores/page.tsx` | 387 |
| `apps/web/src/app/(app)/usuarios/page.tsx` | 317 |
| `packages/shared/src/normalize.test.ts` | 258 (não é código de produção) |
| `apps/web/src/app/(app)/empresas-juniores/[id]/page.tsx` | 287 |

Sugestão para as páginas do front: extrair filtros, tabela e diálogos para `apps/web/src/components/<tema>/`.

## Fora da contagem

- `apps/api/prisma/schema.prisma` tem 433 linhas (schema, não código-fonte; manter em um arquivo é o padrão do Prisma).
