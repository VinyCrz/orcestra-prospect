import { z } from 'zod';
import { PAPEIS } from './enums';

export const senhaSchema = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres')
  .max(128, 'A senha é muito longa')
  .regex(/\p{L}/u, 'A senha deve conter ao menos uma letra')
  .regex(/\d/, 'A senha deve conter ao menos um número')
  .regex(/[^\p{L}\d\s]/u, 'A senha deve conter ao menos um símbolo (ex.: ! @ # $)');

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

/** Autocadastro pela tela "Criar conta": exige o código da equipe definido pelo ADMIN. Entra sempre como SDR. */
export const cadastroSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  senha: senhaSchema,
  codigo: z.string().trim().min(1, 'Informe o código da equipe').max(64),
});
export type CadastroInput = z.infer<typeof cadastroSchema>;

/** Código da equipe para o autocadastro. `null` fecha o cadastro. */
export const codigoCadastroSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(8, 'O código deve ter pelo menos 8 caracteres')
    .max(64, 'O código é muito longo')
    .regex(/^\S+$/, 'O código não pode ter espaços')
    .nullable(),
});
export type CodigoCadastroInput = z.infer<typeof codigoCadastroSchema>;

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
