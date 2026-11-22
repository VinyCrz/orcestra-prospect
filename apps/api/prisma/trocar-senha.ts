/**
 * Troca a senha de um usuário pelo terminal (sem passar a senha por linha de comando, log ou histórico).
 * Uso (na raiz): pnpm trocar-senha <email>
 * A senha é digitada sem eco, confirmada, validada pela política (senhaSchema) e gravada com argon2id.
 * Todas as sessões (refresh tokens) do usuário são revogadas e a troca vai para o AuditLog.
 */
import { senhaSchema } from '@orcestra/shared';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

function perguntarOculto(rotulo: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) return reject(new Error('Rode este comando num terminal interativo.'));
    process.stdout.write(rotulo);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    let valor = '';
    const aoDigitar = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off('data', aoDigitar);
          process.stdout.write('\n');
          return resolve(valor);
        }
        if (c === '\u0003') {
          entrada.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') valor = valor.slice(0, -1);
        else valor += c;
      }
    };
    entrada.on('data', aoDigitar);
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Informe o e-mail: pnpm trocar-senha <email>');
  const prisma = new PrismaClient();
  try {
    const u = await prisma.usuario.findUnique({ where: { email }, select: { id: true, nome: true } });
    if (!u) throw new Error(`Usuário ${email} não encontrado.`);
    console.log(`Trocando a senha de ${u.nome} (${email}).`);
    console.log('Requisitos: 10+ caracteres, com letra, número e símbolo.');
    const senha = await perguntarOculto('Nova senha: ');
    const ok = senhaSchema.safeParse(senha);
    if (!ok.success) throw new Error(ok.error.issues.map((i) => i.message).join('; '));
    if ((await perguntarOculto('Repita a senha: ')) !== senha) throw new Error('As senhas não conferem.');
    const senhaHash = await argon2.hash(senha, { type: argon2.argon2id });
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: u.id }, data: { senhaHash } }),
      prisma.refreshToken.updateMany({ where: { usuarioId: u.id, revogadoEm: null }, data: { revogadoEm: new Date() } }),
      prisma.auditLog.create({
        data: { usuarioId: null, acao: 'SENHA_TROCADA_TERMINAL', entidade: 'Usuario', entidadeId: u.id, dados: {} },
      }),
    ]);
    console.log('Senha trocada. As sessões abertas desse usuário foram encerradas.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
