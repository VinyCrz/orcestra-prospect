import { describe, expect, it } from 'vitest';
import { senhaSchema } from './schemas';

describe('senhaSchema', () => {
  it.each(['TroqueEstaSenha123!', 'abc123!@#xyz'])('aceita %s', (s) => {
    expect(senhaSchema.safeParse(s).success).toBe(true);
  });
  it.each(['curta1!', 'semnumero!!!!', 'semsimbolo1234', '1234567890!!'])('rejeita %s', (s) => {
    expect(senhaSchema.safeParse(s).success).toBe(false);
  });
});
