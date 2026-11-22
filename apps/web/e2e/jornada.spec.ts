import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Jornada principal: login -> filtrar EJ -> registrar interação -> mover no kanban -> ver dashboard.
 * Usa a EJ "QA TESTE JORNADA <ts>" criada e removida pelo spec.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@orcestra.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA ?? 'TroqueEstaSenha123!';
const RAIZ = path.resolve(__dirname, '../../..');

const TS = Date.now();
const NOME = `QA TESTE JORNADA ${TS}`;
const INICIO = new Date(TS - 1000).toISOString().replace('T', ' ').replace('Z', '');

function psql(sql: string) {
  return execSync(
    'sg docker -c "docker compose exec -T postgres psql -U orcestra -d orcestra_prospect -v ON_ERROR_STOP=1 -q"',
    { cwd: RAIZ, input: sql, encoding: 'utf8' },
  );
}
function limpar(comAudit: boolean) {
  const ejs = `(select id from empresas_juniores where nome like 'QA TESTE JORNADA %')`;
  psql(`
    ${comAudit ? `delete from audit_logs where "criadoEm" >= '${INICIO}';` : ''}
    delete from tarefas where "empresaJuniorId" in ${ejs};
    delete from interacoes where "empresaJuniorId" in ${ejs};
    delete from empresas_juniores where nome like 'QA TESTE JORNADA %';
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

test.beforeAll(async () => {
  limpar(false);
  admin = await pwRequest.newContext({ baseURL: BASE });
  const r = await admin.post('/api/auth/login', { data: { email: ADMIN_EMAIL, senha: ADMIN_SENHA } });
  const auth = { Authorization: `Bearer ${((await r.json()) as { accessToken: string }).accessToken}` };
  const c = await admin.post('/api/empresas-juniores', { data: { nome: NOME, uf: 'RS', site: 'https://example.com' }, headers: auth });
  expect(c.ok()).toBeTruthy();
  ejId = ((await c.json()) as { id: string }).id;
});

test.afterAll(async () => {
  await admin?.dispose();
  limpar(true);
});

test('login, filtrar EJ, registrar interação, mover no kanban e ver o dashboard', async ({ page }) => {
  await entrar(page);

  // filtrar pela EJ de teste e abrir
  await page.getByLabel('Buscar por nome').fill(NOME);
  await page.getByRole('link', { name: NOME }).click();
  await expect(page).toHaveURL(new RegExp(`/empresas-juniores/${ejId}`));

  // registrar interação (EJ não trabalhada: aceita mover para Primeiro contato)
  await page.getByRole('button', { name: 'Registrar interação' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Resumo').fill('Interação da jornada automatizada');
  await dlg.getByRole('button', { name: 'Registrar' }).click();
  await expect(dlg.getByText('Mover para Primeiro contato?')).toBeVisible();
  await dlg.getByRole('button', { name: 'Mover para Primeiro contato' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('timeline').getByText('Interação da jornada automatizada')).toBeVisible();

  // mover no kanban
  await page.goto('/funil');
  await page.getByLabel('Buscar').fill(NOME);
  const card = page.getByTestId(`card-${ejId}`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Mover .* para…/ }).click();
  await page.getByRole('menuitem', { name: 'Em conversa' }).click();
  await expect(page.getByTestId('coluna-EM_CONVERSA').getByTestId(`card-${ejId}`)).toBeVisible();

  // dashboard
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('cards-resumo')).toBeVisible();
});
