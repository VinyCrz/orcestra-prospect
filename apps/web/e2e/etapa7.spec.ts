import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';
import { sqlLimparSupressoes } from './supressao';

/**
 * Fluxos da ETAPA 7: auditoria (ADMIN), política de dados, opt-out com motivo e anonimização.
 * Usa a EJ "QA TESTE E7 <ts>" e um contato criados e removidos pelo spec (inclui a lista de supressão
 * e o histórico de opt-out). Não toca em dados reais.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@orcestra.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA ?? 'TroqueEstaSenha123!';
const RAIZ = path.resolve(__dirname, '../../..');

const TS = Date.now();
const NOME_EJ = `QA TESTE E7 ${TS}`;
const NOME_CONTATO = `Contato QA E7 ${TS}`;
const EMAIL_CONTATO = `qa.e7.${TS}@example.com`;
const INICIO = new Date(TS - 1000).toISOString().replace('T', ' ').replace('Z', '');

function psql(sql: string) {
  return execSync(
    'sg docker -c "docker compose exec -T postgres psql -U orcestra -d orcestra_prospect -v ON_ERROR_STOP=1 -q"',
    { cwd: RAIZ, input: sql, encoding: 'utf8' },
  );
}
function limpar(comAudit: boolean) {
  const ejs = `(select id from empresas_juniores where nome like 'QA TESTE E7 %')`;
  psql(`
    ${comAudit ? `delete from audit_logs where "criadoEm" >= '${INICIO}';` : ''}
    ${sqlLimparSupressoes({ emails: [EMAIL_CONTATO] })}
    delete from historico_opt_out where "contatoId" in (select id from contatos where "empresaJuniorId" in ${ejs});
    delete from tarefas where "empresaJuniorId" in ${ejs};
    delete from interacoes where "empresaJuniorId" in ${ejs};
    delete from inscricoes_cadencia where "empresaJuniorId" in ${ejs};
    delete from contatos where "empresaJuniorId" in ${ejs};
    delete from empresas_juniores where nome like 'QA TESTE E7 %';
  `);
}

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(ADMIN_SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresas-juniores/);
}

let admin: APIRequestContext;
let ejId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  limpar(false);
  admin = await pwRequest.newContext({ baseURL: BASE });
  const r = await admin.post('/api/auth/login', { data: { email: ADMIN_EMAIL, senha: ADMIN_SENHA } });
  const auth = { Authorization: `Bearer ${((await r.json()) as { accessToken: string }).accessToken}` };
  const c = await admin.post('/api/empresas-juniores', {
    data: { nome: NOME_EJ, uf: 'RS', cidade: 'Porto Alegre', site: 'https://example.com' },
    headers: auth,
  });
  expect(c.ok()).toBeTruthy();
  ejId = ((await c.json()) as { id: string }).id;
  const ct = await admin.post(`/api/empresas-juniores/${ejId}/contatos`, {
    data: {
      nome: NOME_CONTATO,
      cargo: 'PRESIDENTE',
      email: EMAIL_CONTATO,
      principal: true,
      baseLegal: 'LEGITIMO_INTERESSE_B2B',
    },
    headers: auth,
  });
  expect(ct.ok()).toBeTruthy();
});

test.afterAll(async () => {
  await admin?.dispose();
  limpar(true);
});

test('ADMIN abre a auditoria e filtra por ação', async ({ page }) => {
  await entrar(page);
  await page.goto('/configuracoes/auditoria');
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
  await expect(page.getByTestId('audit-linha').first()).toBeVisible();
  await page.getByRole('combobox', { name: 'Ação' }).click();
  const opcao = page.getByRole('option').nth(1);
  const acao = (await opcao.textContent())!.trim();
  await opcao.click();
  await expect(page).toHaveURL(new RegExp(`acao=${encodeURIComponent(acao)}`));
  const linhas = page.getByTestId('audit-linha');
  await expect(linhas.first()).toBeVisible();
  await linhas.first().getByRole('button', { name: /detalhes/ }).click();
  for (const t of await linhas.locator('td:nth-child(4)').allTextContents()) expect(t.trim()).toBe(acao);
});

test('política de dados carrega', async ({ page }) => {
  await entrar(page);
  await page.goto('/politica-de-dados');
  await expect(page.getByRole('heading', { name: 'Política de dados', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Base legal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Retenção' })).toBeVisible();
});

test('opt-out exige motivo; anonimizar mostra o rótulo Anonimizado', async ({ page }) => {
  await entrar(page);
  await page.goto(`/empresas-juniores/${ejId}`);
  await page.getByRole('button', { name: `Editar ${NOME_CONTATO}` }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Opt-out (não deve ser contatado)').check();
  await expect(dlg.getByText('encerradas')).toBeVisible();
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(dlg.getByText('Informe o motivo do opt-out')).toBeVisible();
  await dlg.getByLabel('Motivo do opt-out *').fill('Pedido do titular (QA E7)');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(dlg).toBeHidden();
  const card = page.getByTestId('contato').filter({ hasText: NOME_CONTATO });
  await expect(card).toContainText('Pedido do titular (QA E7)');
  await expect(card.getByRole('link', { name: /example\.com/ })).toHaveCount(0);

  await card.getByRole('button', { name: 'Anonimizar' }).click();
  const conf = page.getByRole('dialog');
  const botao = conf.getByRole('button', { name: 'Anonimizar definitivamente' });
  await expect(botao).toBeDisabled();
  await conf.getByLabel(/Digite ANONIMIZAR/).fill('ANONIMIZAR');
  await botao.click();
  await expect(conf).toBeHidden();
  const anon = page.getByTestId('contato').filter({ hasText: 'Contato anonimizado' });
  await expect(anon.getByText('Anonimizado', { exact: true })).toBeVisible();
  await expect(anon.getByRole('button', { name: /^Editar/ })).toHaveCount(0);
});
