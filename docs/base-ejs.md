# Base de Empresas Juniores

Resumo dos totais, fontes e lacunas: `data/RELATORIO.md` (ler sob demanda; é curto).
Dados brutos: `data/ejs.json` e `data/ejs.csv` são grandes e estão bloqueados para leitura pelo `.claude/settings.json`. Para consultar, use o banco ou o script de coleta.

## Pipeline (`scripts/coleta/src/`)

1. **FEJERS** (`sources/fejers.ts`): API pública `api.fejers.org.br/junior-enterprises`. Traz EJs do RS com detalhes e o cadastro nacional da rede (nome, CNPJ, ID Brasil Júnior).
2. **RioJunior** (`sources/riojunior.ts`): página pública de EJs e API REST pública do WordPress (áreas e serviços).
3. **Receita Federal via BrasilAPI** (fallback minhareceita.org), em `cnpj.ts`: razão social, município, UF, abertura e situação cadastral.
4. **IBGE** (`ibge.ts`): grafia oficial das cidades.
5. Normalização e deduplicação em `packages/shared/src/normalize.ts` (CNPJ com dígito verificador, UF, cidade, IES, URLs, Instagram). Deduplicação por CNPJ; sem CNPJ, nome normalizado + IES + UF.

Infraestrutura: `http.ts` (intervalo mínimo de 1,2 s por host, backoff em 429/5xx, User-Agent genérico), `base.ts`, `csv.ts`, `relatorio.ts`, `index.ts` (orquestra).

## Regras

- Só fontes públicas, sem login; robots.txt respeitado; cache em `data/cache/` (fora do git, bloqueado para leitura).
- Nada inventado: campo não confirmado fica `null`. Toda EJ tem `fonteUrl` e `coletadoEm`.
- LGPD: só dados da organização. Quadro societário, e-mail e telefone da Receita são descartados antes do cache. E-mails e telefones das federações só entram se institucionais (e-mail com o nome da EJ ou `contato@`; telefone fixo). Celulares são descartados. A tabela `Contato` fica vazia.
- Núcleo e número de membros ficam vazios: nenhuma fonte publica isso de forma estruturada.
- Cidades usam o nome do IBGE; nomes de IES têm acentos restaurados só por dicionário em `normalize.ts`.

## Atualização

```bash
pnpm coleta                      # usa cache
pnpm coleta --atualizar            # ignora cache das páginas
pnpm coleta --limite-cnpj=N        # limita consultas novas
pnpm db:seed                     # carrega no banco (idempotente)
```

O seed não sobrescreve campos de trabalho comercial.
