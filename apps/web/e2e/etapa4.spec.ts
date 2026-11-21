import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Fluxos da ETAPA 4: configuração do score (ADMIN), card de score no detalhe e filtro por faixa na URL.
 * Usa a EJ de teste "QA TESTE E4 <ts>" criada e removida pelo próprio spec; o peso alterado é restaurado ao final.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@orcestra.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA ?? 'TroqueEstaSenha123!';
const RAIZ = path.resolve(__dirname, '../../..');

const TS = Date.now();
const NOME = `QA TESTE E4 ${TS}`;
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
    delete from empresas_juniores where nome like 'QA TESTE E4 %';
  `);
}

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(ADMIN_SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresas-juniores/);
}

interface Config {
  limiares: { A: number; B: number; C: number };
  criterios: { chave: string; peso: number; ativo: boolean; parametros: Record<string, unknown> }[];
}

let admin: APIRequestContext;
let auth: { Authorization: string };
let ejId = '';
let original: Config | null = null;

async function lerConfig(): Promise<Config> {
  const r = await admin.get('/api/score/config', { headers: auth });
  const c = (await r.json()) as Config;
  return {
    limiares: c.limiares,
    criterios: c.criterios.map(({ chave, peso, ativo, parametros }) => ({ chave, peso, ativo, parametros })),
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  limpar(false);
  admin = await pwRequest.newContext({ baseURL: BASE });
  const r = await admin.post('/api/auth/login', { data: { email: ADMIN_EMAIL, senha: ADMIN_SENHA } });
  auth = { Authorization: `Bearer ${((await r.json()) as { accessToken: string }).accessToken}` };
  original = await lerConfig();
  const c = await admin.post('/api/empresas-juniores', { data: { nome: NOME, uf: 'RS' }, headers: auth });
  expect(c.ok()).toBeTruthy();
  ejId = ((await c.json()) as { id: string }).id;
});

test.afterAll(async () => {
  if (original) await admin.put('/api/score/config', { data: original, headers: auth });
  await admin?.dispose();
  limpar(true);
});

test('ADMIN altera um peso em /configuracoes/score e salva', async ({ page }) => {
  await entrar(page);
  await page.goto('/configuracoes/score');
  await expect(page.getByRole('heading', { name: 'Score de ICP' })).toBeVisible();
  const campo = page.locator('#peso-FEDERADA');
  await expect(campo).toBeVisible();
  const atual = Number(await campo.inputValue());
  const novo = atual >= 99 ? atual - 1 : atual + 1;
  await campo.fill(String(novo));
  await page.getByTestId('salvar-score').click();
  await expect(page.getByText(/recálculo enfileirado|Nenhuma alteração/i).first()).toBeVisible();
  const salvo = await lerConfig();
  expect(salvo.criterios.find((c) => c.chave === 'FEDERADA')?.peso).toBe(novo);
});

test('detalhe da EJ mostra o card de score', async ({ page }) => {
  await entrar(page);
  await page.goto(`/empresas-juniores/${ejId}`);
  await expect(page.getByRole('heading', { name: NOME })).toBeVisible();
  await expect(page.getByTestId('card-score')).toBeVisible();
  await expect(page.getByTestId('card-score').getByText('Score de ICP')).toBeVisible();
});

test('filtro por faixa aparece na URL', async ({ page }) => {
  await entrar(page);
  await page.getByTestId('abrir-filtros').click();
  await page.getByRole('group', { name: /Faixa de ICP/ }).getByLabel('Faixa A').check();
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page).toHaveURL(/faixaIcp=A/);
});
