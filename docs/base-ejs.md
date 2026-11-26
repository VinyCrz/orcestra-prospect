# Base de Empresas Juniores

Resumo dos totais, fontes e lacunas: `data/RELATORIO.md` (ler sob demanda; é curto).
Dados brutos: `data/ejs.json` e `data/ejs.csv` são grandes. Para consultar, use o banco ou o script de coleta.

## Pipeline (`scripts/coleta/src/`)

1. **FEJERS** (`sources/fejers.ts`): API pública `api.fejers.org.br/junior-enterprises`. Traz EJs do RS com detalhes e o cadastro nacional da rede (nome, CNPJ, ID Brasil Júnior).
2. **RioJunior** (`sources/riojunior.ts`): página pública de EJs e API REST pública do WordPress (áreas e serviços).
3. **Receita Federal via BrasilAPI** (fallback minhareceita.org), em `cnpj.ts`: razão social, município, UF, abertura e situação cadastral.
4. **IBGE** (`ibge.ts`): grafia oficial das cidades.
5. **Redes encontradas por busca na web** (`redes-encontradas.ts` + `data/redes-encontradas.json`): Instagram/LinkedIn `/company/`/site (e, quando publicados pela EJ ou pela IES, e-mail e telefone institucionais) de EJs sem contato, cada um com `evidencia` (URL pública) e `criterio`. Só preenche campos vazios. Aceito só com nome igual + IES ou cidade na própria evidência; sem perfis pessoais. Feito para as 27 UFs em 22/11/2026 (EJs ativas sem contato). Novas buscas: acrescentar entradas no mesmo arquivo. O Portal BJ não é usado: os Termos de Uso proíbem extração automatizada e reprodução da base.
6. **Verificação dos sites** (`links.ts`): abre cada site; fora do ar (sem DNS, 404/410, certificado inválido, domínio estacionado/à venda, sem resposta) → `site = null` e lista no relatório. Site no ar e EJ sem Instagram/LinkedIn → usa o perfil linkado no próprio site, só se casar com o nome da EJ ou o endereço do site (ambíguo → nada). Também lê a página de contato do site: e-mail institucional (preferindo o do domínio do site) e o telefone que a EJ divulga em link de WhatsApp ou `tel:` (só se houver um único número). Site hospedado dentro do domínio de outro (IES, Wix, Google Sites) → só e-mail com o nome da EJ, sem telefone. Cache em `data/cache/links` (7 dias). `--sem-links` pula.
7. Normalização e deduplicação em `packages/shared/src/normalize.ts` (CNPJ com dígito verificador, UF, cidade, IES, URLs, Instagram). Deduplicação por CNPJ; sem CNPJ, nome normalizado + IES + UF.

Infraestrutura: `http.ts` (intervalo mínimo de 1,2 s por host, backoff em 429/5xx, User-Agent genérico), `base.ts`, `csv.ts`, `relatorio.ts`, `index.ts` (orquestra).

## Regras

- Só fontes públicas, sem login; robots.txt respeitado; cache em `data/cache/` (fora do git, bloqueado para leitura).
- Nada inventado: campo não confirmado fica `null`. Toda EJ tem `fonteUrl` e `coletadoEm`.
- LGPD: só dados da organização. Telefone celular só entra quando é o canal comercial que a própria EJ divulga no próprio site (link de WhatsApp ou `tel:`); número solto em texto ou de pessoa nunca entra. Quadro societário, e-mail e telefone da Receita são descartados antes do cache. E-mails e telefones das federações só entram se institucionais (e-mail com o nome da EJ ou `contato@`; telefone fixo). Celulares são descartados. A tabela `Contato` fica vazia.
- Núcleo e número de membros ficam vazios: nenhuma fonte publica isso de forma estruturada.
- Cidades usam o nome do IBGE; nomes de IES têm acentos restaurados só por dicionário em `normalize.ts`.

## Atualização

```bash
pnpm coleta                      # usa cache
pnpm coleta --atualizar            # ignora cache das páginas e das checagens de sites
pnpm coleta --sem-links            # não verifica sites
pnpm coleta --limite-cnpj=N        # limita consultas novas
pnpm db:seed                     # carrega no banco (idempotente)
pnpm --filter @orcestra/api db:sincronizar   # só preenche contatos vazios (é o que roda no deploy)
# depois: Configurações › Score de ICP › Recalcular tudo (o critério "Tem site/redes" muda)
```

O seed não sobrescreve campos de trabalho comercial.

No site publicado (Render) quem leva a coleta ao banco é `apps/api/prisma/sincronizar-base.ts`, na subida do container:
só preenche contatos vazios das EJs existentes (não apaga nem troca o que foi editado no sistema), soma as fontes,
marca o score para recálculo e grava o hash do `ejs.json` em `config_sistema` para não repetir. EJs novas no arquivo
só entram pelo seed completo.

## Retenção e direitos do titular (LGPD, Etapa 7)

Decisão: **nada é apagado automaticamente**. A retenção é revisada por pessoas.

- `GET /lgpd/retencao` (ADMIN, paginado) lista contatos **candidatos**: `mandatoFim` anterior a hoje − 24 meses **e**
  nenhuma interação nos últimos 24 meses, ainda não anonimizados. O ADMIN/GESTOR decide caso a caso e usa
  `POST /contatos/:id/anonimizar` (`{"confirmacao":"ANONIMIZAR"}`).
- Anonimizar limpa nome, e-mail, telefone, WhatsApp, LinkedIn, descrição do cargo, datas de mandato e motivos de
  opt-out; mantém interações/tarefas (sem vínculo pessoal), encerra cadências, cancela tarefas pendentes e grava o
  contato na **lista de supressão** antes de apagar os valores.
- Lista de supressão (`supressoes_contato`): apenas hashes HMAC-SHA256 (`SUPRESSAO_PEPPER`) de e-mail e telefone.
  Impede recriar/reimportar o contato (criação manual e importação rejeitam com "Contato suprimido
  (opt-out/anonimizado)"). Desmarcar um opt-out (GESTOR/ADMIN) remove só as supressões por OPT_OUT; anonimização é
  definitiva. `POST /lgpd/supressao/backfill` (ADMIN, idempotente) preenche a lista a partir dos opt-outs existentes.
  Não troque o pepper depois de usado (invalida a lista).
- `GET /contatos/:id/exportar` (GESTOR/ADMIN) devolve o JSON do titular (contato, EJ, interações, tarefas,
  inscrições com passos, histórico de opt-out, auditoria) e grava `CONTATO_EXPORTADO`.
- Histórico de opt-out (`historico_opt_out`) é append-only; marcar exige motivo.
