import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Carrega ADMIN_EMAIL/ADMIN_SENHA do .env da raiz (sem sobrescrever variáveis já definidas).
const envPath = path.resolve(__dirname, '../../.env');
if (existsSync(envPath)) {
  for (const linha of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

/**
 * E2E contra a stack em execução (docker compose up ou pnpm dev).
 * URL base: E2E_BASE_URL (padrão http://localhost:3000).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'pt-BR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
