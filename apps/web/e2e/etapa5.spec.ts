import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';
import { sqlLimparSupressoes } from './supressao';

/**
 * Fluxos da ETAPA 5: inscrever EJ na cadência seed -> tarefa na agenda -> gerar mensagem -> marcar como
 * enviada; contato em opt-out bloqueia a mensagem. Usa EJs "QA TESTE E5 <ts>" (e contatos) criadas e
 * removidas pelo spec. Não altera cadência/templates do seed.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@orcestra.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA ?? 'TroqueEstaSenha123!';
const RAIZ = path.resolve(__dirname, '../../..');
const CADENCIA = 'Gamificação para EJs — engajamento e retenção';

const TS = Date.now();
const M = `QA TESTE E5 ${TS}`;
const INICIO = new Date(TS - 1000).toISOString().replace('T', ' ').replace('Z', '');

function psql(sql: string) {
  return execSync(
    'sg docker -c "docker compose exec -T postgres psql -U orcestra -d orcestra_prospect -v ON_ERROR_STOP=1 -q"',
    { cwd: RAIZ, input: sql, encoding: 'utf8' },
  );
}
function limpar(comAudit: boolean) {
  const ejs = `(select id from empresas_juniores where nome like 'QA TESTE E5 %')`;
  psql(`
    ${sqlLimparSupressoes({ emails: ['A', 'B'].map((x) => `qa.e5.${x.toLowerCase()}.${TS}@example.com`), telefones: ['51999990000'] })}
    ${comAudit ? `delete from audit_logs where "criadoEm" >= '${INICIO}';` : ''}
    delete from tarefas where "empresaJuniorId" in ${ejs};
    delete from interacoes where "empresaJuniorId" in ${ejs};
    delete from inscricoes_cadencia where "empresaJuniorId" in ${ejs};
    delete from contatos where "empresaJuniorId" in ${ejs};
    delete from empresas_juniores where nome like 'QA TESTE E5 %';
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
const ejs: { id: string; nome: string; contatoId: string }[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  limpar(false);
  admin = await pwRequest.newContext({ baseURL: BASE });
  const r = await admin.post('/api/auth/login', { data: { email: ADMIN_EMAIL, senha: ADMIN_SENHA } });
  auth = { Authorization: `Bearer ${((await r.json()) as { accessToken: string }).accessToken}` };
  for (const s of ['A', 'B']) {
    const nome = `${M} ${s}`;
    const c = await admin.post('/api/empresas-juniores', { data: { nome, uf: 'RS', cidade: 'Porto Alegre', site: 'https://example.com' }, headers: auth });
    expect(c.ok()).toBeTruthy();
    const id = ((await c.json()) as { id: string }).id;
    const ct = await admin.post(`/api/empresas-juniores/${id}/contatos`, {
      data: {
        nome: `Contato ${s} ${TS}`,
        cargo: 'PRESIDENTE',
        email: `qa.e5.${s.toLowerCase()}.${TS}@example.com`,
        whatsapp: '51999990000',
        principal: true,
        baseLegal: 'LEGITIMO_INTERESSE_B2B',
      },
      headers: auth,
    });
    expect(ct.ok()).toBeTruthy();
    ejs.push({ id, nome, contatoId: ((await ct.json()) as { id: string }).id });
  }
});

test.afterAll(async () => {
  await admin?.dispose();
  limpar(true);
});

async function inscrever(page: Page, ejId: string, contato?: string) {
  await page.goto(`/empresas-juniores/${ejId}`);
  await page.getByRole('button', { name: 'Inscrever em cadência' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Cadência').click();
  await page.getByRole('option', { name: new RegExp(CADENCIA.slice(0, 20)) }).first().click();
  if (contato) {
    await dlg.getByLabel('Contato (opcional)').click();
    await page.getByRole('option', { name: new RegExp(contato) }).click();
  }
  await dlg.getByRole('button', { name: 'Inscrever' }).click();
  await expect(dlg.getByText('1 inscrita(s)')).toBeVisible();
  await dlg.getByRole('button', { name: 'Fechar' }).first().click();
  await expect(page.getByTestId('secao-cadencias').getByTestId('inscricao')).toBeVisible();
}

test('inscrever, gerar mensagem com nome da EJ e marcar como enviada', async ({ page }) => {
  await entrar(page);
  await inscrever(page, ejs[0].id);

  await page.goto('/agenda');
  const tarefa = page.getByTestId('tarefa').filter({ hasText: ejs[0].nome }).first();
  await expect(tarefa).toBeVisible();
  await tarefa.getByRole('button', { name: 'Gerar mensagem' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByTestId('msg-texto')).toHaveValue(new RegExp(ejs[0].nome));
  await expect(dlg.getByText('Nada é enviado automaticamente')).toBeVisible();
  await dlg.getByRole('button', { name: 'Marcar como enviada' }).click();
  await expect(dlg).toBeHidden();

  await page.goto(`/empresas-juniores/${ejs[0].id}`);
  await expect(page.getByTestId('timeline')).toContainText('Inscrita em cadência');
  await expect(page.getByTestId('secao-cadencias')).toContainText('1/4 passos');
});

test('contato em opt-out bloqueia a mensagem', async ({ page }) => {
  await entrar(page);
  await inscrever(page, ejs[1].id, 'Contato B');
  psql(`update contatos set "optOut" = true, "optOutEm" = now(), "optOutMotivo" = 'QA E5' where id = '${ejs[1].contatoId}';`);

  await page.goto('/agenda');
  const tarefa = page.getByTestId('tarefa').filter({ hasText: ejs[1].nome }).first();
  await expect(tarefa).toBeVisible();
  await tarefa.getByRole('button', { name: 'Gerar mensagem' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByTestId('mensagem-bloqueada')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Marcar como enviada' })).toHaveCount(0);
  await expect(dlg.getByRole('button', { name: 'Copiar' })).toHaveCount(0);
});
