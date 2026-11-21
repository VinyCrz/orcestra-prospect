import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Fluxos da ETAPA 2: formulário de EJ, contatos (opt-out), ações em massa, listas salvas,
 * rodízio da carteira, wizard de importação e permissões do SDR.
 * Todos os dados de teste usam o prefixo "QA TESTE" / "qa-sdr-" e são removidos no afterAll
 * (também no beforeAll, caso uma execução anterior tenha sido interrompida).
 * Nunca toca nas EJs reais: filtros sempre restritos ao marcador único da execução.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@orcestra.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA ?? 'TroqueEstaSenha123!';
const SENHA_SDR = 'QaTeste#2026abc';
const RAIZ = path.resolve(__dirname, '../../..');

const TS = Date.now();
const M = `QA TESTE ${TS}`;
const INICIO = new Date(TS - 1000).toISOString().replace('T', ' ').replace('Z', '');
const SDR1 = `qa-sdr-1-${TS}@example.test`;
const SDR2 = `qa-sdr-2-${TS}@example.test`;

function psql(sql: string) {
  return execSync(
    'sg docker -c "docker compose exec -T postgres psql -U orcestra -d orcestra_prospect -v ON_ERROR_STOP=1 -q"',
    { cwd: RAIZ, input: sql, encoding: 'utf8' },
  );
}

function limpar(comAudit: boolean) {
  psql(`
    ${comAudit ? `delete from audit_logs where "criadoEm" >= '${INICIO}';` : ''}
    delete from empresas_juniores where nome like 'QA TESTE %';
    delete from importacoes where "arquivoNome" like 'qa-teste-%';
    delete from listas_salvas where nome like 'QA TESTE %';
    delete from refresh_tokens where "usuarioId" in (select id from usuarios where email like 'qa-sdr-%@example.test');
    delete from usuarios where email like 'qa-sdr-%@example.test';
  `);
}

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresas-juniores/);
}

async function tokenApi(api: APIRequestContext, email: string, senha: string) {
  const r = await api.post('/api/auth/login', { data: { email, senha } });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { accessToken: string }).accessToken;
}

let admin: APIRequestContext;
let auth: { Authorization: string };
const ids: { sdr1?: string; sdr2?: string; ejs: string[] } = { ejs: [] };

async function post<T>(url: string, data: unknown): Promise<T> {
  const r = await admin.post(`/api${url}`, { data, headers: auth });
  expect(r.ok(), `${url}: ${r.status()} ${await r.text()}`).toBeTruthy();
  return (await r.json()) as T;
}
async function get<T>(url: string): Promise<T> {
  const r = await admin.get(`/api${url}`, { headers: auth });
  expect(r.ok(), `${url}: ${r.status()}`).toBeTruthy();
  return (await r.json()) as T;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  limpar(false);
  admin = await pwRequest.newContext({ baseURL: BASE });
  auth = { Authorization: `Bearer ${await tokenApi(admin, ADMIN_EMAIL, ADMIN_SENHA)}` };
  ids.sdr1 = (await post<{ id: string }>('/usuarios', { nome: 'QA SDR Um', email: SDR1, senha: SENHA_SDR, papel: 'SDR' })).id;
  ids.sdr2 = (await post<{ id: string }>('/usuarios', { nome: 'QA SDR Dois', email: SDR2, senha: SENHA_SDR, papel: 'SDR' })).id;
  for (const s of ['A', 'B', 'C']) {
    ids.ejs.push((await post<{ id: string }>('/empresas-juniores', { nome: `${M} ${s}`, uf: 'RS' })).id);
  }
});

test.afterAll(async () => {
  await admin?.dispose();
  limpar(true);
});

test('formulário de EJ: criar, editar e bloquear duplicada (409)', async ({ page }) => {
  await entrar(page, ADMIN_EMAIL, ADMIN_SENHA);
  const nome = `${M} Formulario`;
  await page.goto('/empresas-juniores/nova');
  await page.getByLabel('Nome da EJ *').fill(nome);

  await page.locator('#uf').click();
  await page.getByRole('option', { name: /^RS — / }).click();
  await page.locator('#cidade').fill('Porto Alegre');
  await page.getByRole('button', { name: /Cadastrar EJ|Salvar alterações/ }).click();

  await expect(page).toHaveURL(/\/empresas-juniores\/[a-z0-9]+$/);
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();

  // editar
  await page.getByRole('link', { name: /Editar/ }).click();
  await expect(page).toHaveURL(/\/editar$/);
  await page.locator('#cidade').fill('Canoas');
  await page.getByRole('button', { name: /Salvar/ }).click();
  await expect(page).toHaveURL(/\/empresas-juniores\/[a-z0-9]+$/);
  await expect(page.getByText('Canoas').first()).toBeVisible();

  // duplicada: mesmo nome + UF
  await page.goto('/empresas-juniores/nova');
  await page.getByLabel('Nome da EJ *').fill(nome);
  await page.locator('#uf').click();
  await page.getByRole('option', { name: /^RS — / }).click();
  await page.getByRole('button', { name: /Cadastrar EJ|Salvar alterações/ }).click();
  const alerta = page.getByRole('alert').filter({ hasText: 'Já existe uma Empresa Júnior' });
  await expect(alerta).toBeVisible();
  await expect(alerta.getByRole('link', { name: nome })).toBeVisible();
  await expect(page).toHaveURL(/\/nova$/);
});

test('contatos: CRUD e opt-out desativa mailto e wa.me', async ({ page }) => {
  await entrar(page, ADMIN_EMAIL, ADMIN_SENHA);
  await page.goto(`/empresas-juniores/${ids.ejs[0]}`);
  await expect(page.getByTestId('contato')).toHaveCount(0);

  await page.getByRole('button', { name: 'Novo contato' }).click();
  await page.getByLabel('Nome *').fill('Contato QA');
  await page.getByLabel('E-mail', { exact: true }).fill('contato.qa@example.test');
  await page.getByLabel('WhatsApp').fill('51999990000');
  await page.getByRole('dialog').getByRole('button', { name: /Salvar|Adicionar|Cadastrar/ }).click();

  const contato = page.getByTestId('contato');
  await expect(contato).toHaveCount(1);
  await expect(contato.locator('a[href="mailto:contato.qa@example.test"]')).toBeVisible();
  await expect(contato.locator('a[href^="https://wa.me/"]')).toBeVisible();

  // opt-out
  await page.getByRole('button', { name: 'Editar Contato QA' }).click();
  await page.getByLabel('Opt-out (não deve ser contatado)').check();
  await page.getByLabel('Motivo do opt-out').fill('Pediu para não receber');
  await page.getByRole('dialog').getByRole('button', { name: /Salvar|Atualizar/ }).click();
  await expect(contato.getByText('Opt-out').first()).toBeVisible();
  await expect(contato.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(contato.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
  await expect(contato.getByText('contato.qa@example.test')).toBeVisible();

  // excluir
  await page.getByRole('button', { name: 'Excluir Contato QA' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByTestId('contato')).toHaveCount(0);
});

test('ações em massa: mudar status e adicionar tag só nas EJs de teste', async ({ page }) => {
  await entrar(page, ADMIN_EMAIL, ADMIN_SENHA);
  await page.goto(`/empresas-juniores?busca=${encodeURIComponent(M)}`);
  const linhas = page.getByTestId('linha-ej');
  await expect(linhas.first()).toBeVisible();
  const total = await linhas.count();
  expect(total).toBeGreaterThanOrEqual(3);
  for (const l of await linhas.all()) await expect(l).toContainText('QA TESTE');

  await page.getByLabel('Selecionar todas as EJs da página').check();
  await expect(page.getByTestId('barra-massa')).toContainText(`${total} EJs selecionadas`);
  await page.getByTestId('barra-massa').getByRole('button', { name: /Aplicar ação|Ação em massa|Ação/ }).first().click();
  await page.locator('#massa-acao').click();
  await page.getByRole('option', { name: 'Mudar status' }).click();
  await page.locator('#massa-valor').click();
  await page.getByRole('option', { name: 'Pesquisada' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText(/\d+ alterada\(s\)/).first()).toBeVisible();
  await expect(page.getByTestId('barra-massa')).toHaveCount(0);

  const lista = await get<{ items: { nome: string; statusProspeccao: string }[] }>(
    `/empresas-juniores?busca=${encodeURIComponent(M)}&pageSize=50`,
  );
  const itens = lista.items;
  expect(itens.length).toBe(total);
  expect(itens.every((e) => e.statusProspeccao === 'PESQUISADA')).toBeTruthy();

  // tag
  await page.getByLabel('Selecionar todas as EJs da página').check();
  await page.getByTestId('barra-massa').getByRole('button', { name: /Aplicar ação|Ação em massa|Ação/ }).first().click();
  await page.locator('#massa-acao').click();
  await page.getByRole('option', { name: 'Adicionar tag' }).click();
  await page.locator('#massa-valor').click();
  await page.getByRole('option', { name: 'Agrofloresta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText(/\d+ alterada\(s\)/).first()).toBeVisible();
  await expect(page.getByTestId('barra-massa')).toHaveCount(0);
  const det = await get<{ tags: { nome: string }[] }>(`/empresas-juniores/${ids.ejs[0]}`);
  expect(det.tags.map((t) => t.nome)).toContain('Agrofloresta');
});

test('listas salvas: salvar, aplicar e excluir', async ({ page }) => {
  await entrar(page, ADMIN_EMAIL, ADMIN_SENHA);
  const nomeLista = `${M} lista`;
  await page.goto(`/empresas-juniores?busca=${encodeURIComponent(M)}`);
  await expect(page.getByTestId('linha-ej').first()).toBeVisible();
  await page.getByTestId('abrir-listas').click();
  await page.getByLabel('Salvar filtros atuais como').fill(nomeLista);
  await page.getByRole('button', { name: 'Salvar lista' }).click();
  await expect(page.getByText(nomeLista)).toBeVisible();
  await page.keyboard.press('Escape');

  // sem filtros e aplica a lista
  await page.goto('/empresas-juniores');
  await expect(page.getByTestId('linha-ej').first()).toBeVisible();
  await page.getByTestId('abrir-listas').click();
  await page.getByRole('button', { name: 'Aplicar' }).first().click();
  await expect(page).toHaveURL(/busca=QA/);
  const linhas = page.getByTestId('linha-ej');
  await expect(linhas.first()).toContainText('QA TESTE');
  for (const l of await linhas.all()) await expect(l).toContainText('QA TESTE');

  // excluir
  await page.getByTestId('abrir-listas').click();
  await page.getByRole('button', { name: `Excluir lista ${nomeLista}` }).click();
  const confirma = page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true });
  if (await confirma.isVisible().catch(() => false)) await confirma.click();
  await expect(page.getByText(nomeLista)).toHaveCount(0);
});

test('carteira: rodízio restrito às EJs de teste reparte entre dois SDRs', async ({ page }) => {
  // UI: ADMIN abre a Carteira (sem acionar o rodízio, que não permite restringir às EJs de teste)
  await entrar(page, ADMIN_EMAIL, ADMIN_SENHA);
  await page.goto('/carteira');
  await expect(page.getByRole('heading', { name: 'Carteira' })).toBeVisible();
  await expect(page.getByText('QA SDR Um')).toBeVisible();
  await expect(page.getByText('QA SDR Dois')).toBeVisible();

  // Rodízio real via API, filtrado pelo marcador (só EJs de teste)
  const lista = await get<{ items: unknown[] }>(`/empresas-juniores?busca=${encodeURIComponent(M)}&pageSize=50`);
  const n = (lista.items).length;
  const res = await post<{ resumo?: { atribuidas: number }[]; porSdr?: { atribuidas: number }[] } & Record<string, unknown>>(
    '/carteira/distribuir',
    { modo: 'RODIZIO', sdrIds: [ids.sdr1, ids.sdr2], filtros: { busca: M }, apenasSemResponsavel: true },
  );
  expect(JSON.stringify(res)).toContain('atribuidas');
  const resp = await get<{ items: { responsavelId: string | null }[] }>(
    `/empresas-juniores?busca=${encodeURIComponent(M)}&pageSize=50`,
  );
  const its = resp.items;
  expect(its.length).toBe(n);
  const c1 = its.filter((e) => e.responsavelId === ids.sdr1).length;
  const c2 = its.filter((e) => e.responsavelId === ids.sdr2).length;
  expect(c1 + c2).toBe(n);
  expect(Math.abs(c1 - c2)).toBeLessThanOrEqual(1);
});

test('importação: EJs e contatos via CSV até a conclusão e download de erros.csv', async ({ page }) => {
  await entrar(page, ADMIN_EMAIL, ADMIN_SENHA);
  await page.goto('/importacoes');

  const csvEjs = `Nome,UF,E-mail\n${M} Imp1,RS,imp1@example.test\n${M} Imp2,SC,imp2@example.test\n${M} Imp3,PR,email-invalido\n`;
  await page.locator('#imp-arquivo').setInputFiles({ name: 'qa-teste-ejs.csv', mimeType: 'text/csv', buffer: Buffer.from(csvEjs) });
  await page.getByRole('button', { name: 'Enviar e continuar' }).click();
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();
  await expect(page.getByTestId('contagens-previa')).toBeVisible();
  await page.getByRole('button', { name: 'Processar importação' }).click();
  await expect(page.getByRole('button', { name: 'Nova importação' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/2 importadas/)).toBeVisible();
  await expect(page.getByText(/1 com erro/)).toBeVisible();

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('div[aria-live="polite"]').getByRole('button', { name: 'Baixar erros.csv' }).click(),
  ]);
  const conteudo = readFileSync((await dl.path())!, 'utf8');
  expect(conteudo.length).toBeGreaterThan(10);
  expect(conteudo).toContain('email-invalido');

  const ejsCriadas = await get<{ items: unknown[] }>(`/empresas-juniores?busca=${encodeURIComponent(M + ' Imp')}&pageSize=50`);
  expect((ejsCriadas.items).length).toBe(2);

  // contatos (referenciando EJ por nome + UF; uma linha com EJ inexistente gera erro)
  await page.getByRole('button', { name: 'Nova importação' }).click();
  await page.locator('#imp-tipo').click();
  await page.getByRole('option', { name: 'Contatos' }).click();
  const csvContatos = `EJ,UF,Nome,E-mail\n${M} Imp1,RS,Fulano QA,fulano.qa@example.test\n${M} Imp2,SC,Beltrana QA,beltrana.qa@example.test\n${M} Inexistente,AC,Ciclano QA,ciclano.qa@example.test\n`;
  await page.locator('#imp-arquivo').setInputFiles({ name: 'qa-teste-contatos.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContatos) });
  await page.getByRole('button', { name: 'Enviar e continuar' }).click();
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();
  await expect(page.getByTestId('contagens-previa')).toBeVisible();
  await page.getByRole('button', { name: 'Processar importação' }).click();
  await expect(page.getByRole('button', { name: 'Nova importação' })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('div[aria-live="polite"]').getByRole('button', { name: 'Baixar erros.csv' })).toBeVisible();
  expect(psql(`select count(*) from contatos where email like '%.qa@example.test';`)).toContain('2');
});

test('permissões: SDR não vê Carteira/Importações nem edita EJ fora da carteira', async ({ page }) => {
  // Atribui uma EJ ao SDR 1 (uma sem responsável não serve: rodízio já atribuiu). Usa a EJ B explicitamente.
  await post('/carteira/distribuir', { modo: 'MANUAL', ejIds: [ids.ejs[1]], sdrId: ids.sdr1 });
  await post('/carteira/distribuir', { modo: 'MANUAL', ejIds: [ids.ejs[2]], sdrId: ids.sdr2 });

  await entrar(page, SDR1, SENHA_SDR);
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav.getByRole('link', { name: 'Empresas Juniores' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Carteira' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Importações' })).toHaveCount(0);

  // EJ da carteira de outro SDR: sem botão Editar e API recusa
  await page.goto(`/empresas-juniores/${ids.ejs[2]}`);
  await expect(page.getByRole('heading', { name: `${M} C` })).toBeVisible();
  await expect(page.getByRole('link', { name: /Editar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Novo contato' })).toHaveCount(0);

  // EJ da própria carteira: pode editar
  await page.goto(`/empresas-juniores/${ids.ejs[1]}`);
  await expect(page.getByRole('link', { name: /Editar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo contato' })).toBeVisible();

  // API direta com token do SDR
  const sdrApi = await pwRequest.newContext({ baseURL: BASE });
  const h = { Authorization: `Bearer ${await tokenApi(sdrApi, SDR1, SENHA_SDR)}` };
  const patchAlheia = await sdrApi.patch(`/api/empresas-juniores/${ids.ejs[2]}`, { data: { cidade: 'Hack' }, headers: h });
  expect(patchAlheia.status()).toBe(403);
  const patchPropria = await sdrApi.patch(`/api/empresas-juniores/${ids.ejs[1]}`, { data: { cidade: 'Minha' }, headers: h });
  expect(patchPropria.ok()).toBeTruthy();
  expect((await sdrApi.post('/api/carteira/distribuir', { data: { modo: 'MANUAL', ejIds: [ids.ejs[2]], sdrId: ids.sdr1 }, headers: h })).status()).toBe(403);
  expect((await sdrApi.get('/api/importacoes', { headers: h })).status()).toBe(403);
  expect((await sdrApi.get('/api/usuarios', { headers: h })).status()).toBe(403);
  await sdrApi.dispose();
});
