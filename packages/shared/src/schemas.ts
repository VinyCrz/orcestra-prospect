import { z } from 'zod';
import { PAPEIS } from './enums';

export const senhaSchema = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres')
  .max(128, 'A senha é muito longa');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  senha: z.string().min(1, 'Informe a senha'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const esqueciSenhaSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
});
export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaSchema>;

export const redefinirSenhaSchema = z.object({
  token: z.string().min(10),
  senha: senhaSchema,
});
export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;

export const papelSchema = z.enum(PAPEIS);

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  senha: senhaSchema,
  papel: papelSchema,
});
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;

export const atualizarUsuarioSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  papel: papelSchema.optional(),
  ativo: z.boolean().optional(),
});
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
