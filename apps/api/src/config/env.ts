import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET deve ter pelo menos 16 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DIAS: z.coerce.number().int().min(1).default(7),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  /** Vazio (padrão) = sem CORS: o navegador só fala com a API via proxy do web (mesma origem). */
  CORS_ORIGINS: z.string().default(''),
  /** Segredo (pepper) do HMAC da lista de supressão LGPD. Obrigatório em produção; não trocar depois. */
  SUPRESSAO_PEPPER: z.string().optional(),
  RATE_LIMIT_LOGIN_POR_MIN: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_AUTH_POR_MIN: z.coerce.number().int().min(1).default(10),
}).superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production' && (v.SUPRESSAO_PEPPER ?? '').length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SUPRESSAO_PEPPER'],
      message: 'obrigatório em produção, com pelo menos 32 caracteres (openssl rand -hex 32)',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validarEnv(config: Record<string, unknown>): Env {
  const r = envSchema.safeParse(config);
  if (!r.success) {
    throw new Error(
      'Variáveis de ambiente inválidas:\n' +
        r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
  }
  return r.data;
}
