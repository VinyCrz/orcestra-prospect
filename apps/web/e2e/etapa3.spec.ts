import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Fluxos da ETAPA 3: interação com próximo passo -> tarefa na agenda -> concluir; kanban do funil.
 * Usa EJs de teste "QA TESTE E3 <ts>" criadas e removidas pelo próprio spec (nunca toca nas reais).
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@orcestra.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA ?? 'TroqueEstaSenha123!';
const RAIZ = path.resolve(__dirname, '../../..');

const TS = Date.now();
const M = `QA TESTE E3 ${TS}`;
const INICIO = new Date(TS - 1000).toISOString().replace('T', ' ').replace('Z', '');

function psql(sql: string) {
  return execSync(
    'sg docker -c "docker compose exec -T postgres psql -U orcestra -d orcestra_prospect -v ON_ERROR_STOP=1 -q"',
    { cwd: RAIZ, input: sql, encoding: 'utf8' },
  );
}
function limpar(comAudit: boolean) {
  psql(`
    ${comAudit ? `delete from audit_logs where "criadoEm" >= '${INICIO}';` : ''}
    delete from tarefas where titulo like 'QA TESTE E3 %';
    delete from empresas_juniores where nome like 'QA TESTE E3 %';
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
let auth: { Authorization: string };
const ejs: { id: string; nome: string }[] = [];

async function statusDe(id: string) {
  const r = await admin.get(`/api/empresas-juniores/${id}`, { headers: auth });
  return ((await r.json()) as { statusProspeccao: string }).statusProspeccao;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  limpar(false);
  admin = await pwRequest.newContext({ baseURL: BASE });
  const r = await admin.post('/api/auth/login', { data: { email: ADMIN_EMAIL, senha: ADMIN_SENHA } });
  auth = { Authorization: `Bearer ${((await r.json()) as { accessToken: string }).accessToken}` };
  for (const s of ['A', 'B']) {
    const nome = `${M} ${s}`;
    const c = await admin.post('/api/empresas-juniores', { data: { nome, uf: 'RS', site: 'https://example.com' }, headers: auth });
    expect(c.ok()).toBeTruthy();
    ejs.push({ id: ((await c.json()) as { id: string }).id, nome });
  }
});

test.afterAll(async () => {
  await admin?.dispose();
  limpar(true);
});

test('interação com próximo passo cria tarefa na agenda e permite concluir', async ({ page }) => {
  await entrar(page);
  const passo = `QA TESTE E3 passo ${TS}`;
  await page.goto(`/empresas-juniores/${ejs[0].id}`);
  await page.getByRole('button', { name: 'Registrar interação' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Resumo').fill('Conversa de teste automatizado');
  await dlg.getByLabel('Próximo passo (opcional)').fill(passo);
  await dlg.getByLabel('Data do próximo passo').fill(new Date().toISOString().slice(0, 10));
  await expect(dlg.getByText('uma tarefa será criada')).toBeVisible();
  await dlg.getByRole('button', { name: 'Registrar' }).click();

  // EJ não trabalhada: a API sugere mover para Primeiro contato
  await expect(dlg.getByText('Mover para Primeiro contato?')).toBeVisible();
  await dlg.getByRole('button', { name: 'Mover para Primeiro contato' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('timeline').getByText('Conversa de teste automatizado')).toBeVisible();
  expect(await statusDe(ejs[0].id)).toBe('PRIMEIRO_CONTATO');

  await page.goto('/agenda');
  const tarefa = page.getByTestId('tarefa').filter({ hasText: passo });
  await expect(tarefa).toBeVisible();
  await tarefa.getByRole('button', { name: 'Concluir' }).click();
  await expect(tarefa).toHaveCount(0);
});

test('kanban: mover por menu e por arrastar, PERDIDA exige motivo', async ({ page }) => {
  await entrar(page);
  await page.goto('/funil');
  const buscou = page.waitForResponse(
    (r) => r.url().includes('/api/funil/kanban') && r.url().includes('busca=') && r.ok(),
  );
  await page.getByLabel('Buscar').fill(M);
  await buscou;
  const [a, b] = ejs;

  // por menu "Mover para…"
  const cardA = page.getByTestId(`card-${a.id}`);
  await expect(cardA).toBeVisible();
  await cardA.getByRole('button', { name: /Mover .* para…/ }).click();
  await page.getByRole('menuitem', { name: 'Em conversa' }).click();
  await expect(page.getByTestId('coluna-EM_CONVERSA').getByTestId(`card-${a.id}`)).toBeVisible();
  await expect.poll(() => statusDe(a.id)).toBe('EM_CONVERSA');

  // arrastar com o mouse para "Pesquisada"
  const alca = page.getByTestId(`card-${b.id}`).getByRole('button', { name: /^Arrastar/ });
  const origem = (await alca.boundingBox())!;
  const destino = (await page.getByTestId('coluna-PESQUISADA').boundingBox())!;
  await page.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2);
  await page.mouse.down();
  await page.mouse.move(destino.x + destino.width / 2, destino.y + 60, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('coluna-PESQUISADA').getByTestId(`card-${b.id}`)).toBeVisible();
  await expect.poll(() => statusDe(b.id)).toBe('PESQUISADA');

  // PERDIDA abre o diálogo e exige motivo
  await page.getByTestId(`card-${b.id}`).getByRole('button', { name: /Mover .* para…/ }).click();
  await page.getByRole('menuitem', { name: 'Perdida' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  await dlg.getByLabel('Motivo da perda').click();
  await page.getByRole('option').first().click();
  await dlg.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByTestId('coluna-PERDIDA').getByTestId(`card-${b.id}`)).toBeVisible();
  await expect.poll(() => statusDe(b.id)).toBe('PERDIDA');
});
