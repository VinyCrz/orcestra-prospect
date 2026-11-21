import { expect, test, type Page } from '@playwright/test';

/** ETAPA 6: dashboard (período na URL, gráficos), ranking/conquistas e tela de metas. Somente leitura (não altera metas). */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@orcestra.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA ?? 'TroqueEstaSenha123!';

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(ADMIN_SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresas-juniores/);
}

test('ADMIN vê o dashboard, troca o período e vê os gráficos', async ({ page }) => {
  await entrar(page);
  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('cards-resumo')).toBeVisible();

  await page.getByTestId('seletor-periodo').click();
  await page.getByRole('option', { name: 'Últimos 7 dias' }).click();
  await expect(page).toHaveURL(/periodo=7/);

  for (const t of [
    'EJs por UF',
    'Funil de prospecção',
    'Cobertura por federação',
    'Interações por SDR',
    'Taxa de resposta por canal',
    'Motivos de perda',
    'Tempo médio por etapa',
  ]) {
    await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  }
});

test('ranking semanal, conquistas e navegação de semana', async ({ page }) => {
  await entrar(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('bloco-semana')).toBeVisible();
  await expect(page.getByTestId('ranking-semanal')).toBeVisible();
  await expect(page.getByTestId('conquistas')).toBeVisible();
  await expect(page.getByTestId('progresso-meta')).toBeVisible();
  await page.getByRole('button', { name: 'Semana anterior' }).click();
  await expect(page).toHaveURL(/semana=\d{4}-W\d{2}/);
});

test('/configuracoes/metas carrega (sem alterar)', async ({ page }) => {
  await entrar(page);
  await page.goto('/configuracoes/metas');
  await expect(page.getByRole('heading', { name: 'Metas do time' })).toBeVisible();
  await expect(page.getByText('Meta global do time')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avaliar semana anterior' })).toBeVisible();
});
