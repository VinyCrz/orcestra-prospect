import { expect, test } from '@playwright/test';

const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@orcestra.com.br';
const SENHA = process.env.ADMIN_SENHA ?? 'TroqueEstaSenha123!';
const UF = process.env.E2E_UF ?? 'RS';

test('login → lista de Empresas Juniores → filtro por UF', async ({ page }) => {
  // Rota protegida sem sessão redireciona para o login
  await page.goto('/empresas-juniores');
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Abre a lista de EJs
  await expect(page).toHaveURL(/\/empresas-juniores/);
  await expect(page.getByRole('heading', { name: 'Empresas Juniores' })).toBeVisible();
  await expect(page.getByTestId('linha-ej').first()).toBeVisible();
  const resumoAntes = await page.getByTestId('resumo-paginacao').innerText();

  // Filtra por UF
  await page.getByTestId('filtro-uf').click();
  await page.getByRole('option', { name: new RegExp(`^${UF} — `) }).click();
  await expect(page).toHaveURL(new RegExp(`uf=${UF}`));
  await expect(page.getByTestId('resumo-paginacao')).not.toHaveText(resumoAntes);

  const ufs = await page.getByTestId('celula-uf').allInnerTexts();
  expect(ufs.length).toBeGreaterThan(0);
  expect(new Set(ufs)).toEqual(new Set([UF]));

  // Abre o detalhe de uma EJ filtrada e confere a fonte
  await page.getByTestId('linha-ej').first().getByRole('link').click();
  await expect(page.getByText('Fonte dos dados')).toBeVisible();
});
