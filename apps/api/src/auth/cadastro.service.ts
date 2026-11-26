import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { CadastroInput } from '@orcestra/shared';
import { AuditService, mascararEmail } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { usuarioPublico } from './auth.service';
import { SenhaService } from './senha.service';

const CONFIG_ID = 1;

/**
 * Autocadastro com o código da equipe. O código fica só como hash argon2 em `config_sistema`;
 * sem código definido, o cadastro está fechado. Quem se cadastra entra sempre como SDR.
 */
@Injectable()
export class CadastroService {
  private readonly logger = new Logger(CadastroService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly audit: AuditService,
  ) {}

  private config() {
    return this.prisma.configSistema.findUnique({ where: { id: CONFIG_ID } });
  }

  async status() {
    const c = await this.config();
    return { aberto: !!c?.codigoCadastroHash };
  }

  /** Para o ADMIN: diz se há código e quando mudou (o código em si nunca sai do banco). */
  async statusCodigo() {
    const c = await this.config();
    return {
      definido: !!c?.codigoCadastroHash,
      alteradoEm: c?.codigoCadastroAlteradoEm?.toISOString() ?? null,
    };
  }

  async definirCodigo(codigo: string | null, autorId: string) {
    const hash = codigo ? await this.senhas.hash(codigo) : null;
    const agora = new Date();
    await this.prisma.configSistema.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, codigoCadastroHash: hash, codigoCadastroAlteradoEm: agora },
      update: { codigoCadastroHash: hash, codigoCadastroAlteradoEm: agora },
    });
    await this.audit.registrar({
      usuarioId: autorId,
      acao: codigo ? 'CODIGO_CADASTRO_DEFINIDO' : 'CADASTRO_FECHADO',
      entidade: 'ConfigSistema',
      entidadeId: String(CONFIG_ID),
    });
    return this.statusCodigo();
  }

  async cadastrar(dados: CadastroInput) {
    const c = await this.config();
    if (!c?.codigoCadastroHash) {
      throw new ForbiddenException('O cadastro está fechado. Peça acesso a um administrador.');
    }
    // confere o código antes de olhar o e-mail: sem o código, não dá para descobrir quem tem conta
    if (!(await this.senhas.verificar(c.codigoCadastroHash, dados.codigo))) {
      this.logger.warn(`Cadastro recusado para "${mascararEmail(dados.email)}": código inválido`);
      await this.audit.registrar({
        usuarioId: null,
        acao: 'AUTOCADASTRO_RECUSADO',
        entidade: 'Usuario',
        dados: { email: mascararEmail(dados.email), motivo: 'codigo_invalido' },
      });
      throw new UnauthorizedException('Código da equipe inválido');
    }
    const existe = await this.prisma.usuario.findUnique({ where: { email: dados.email } });
    if (existe) throw new ConflictException('Já existe uma conta com este e-mail. Use "Entrar".');
    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dados.nome,
        email: dados.email,
        papel: 'SDR',
        senhaHash: await this.senhas.hash(dados.senha),
      },
    });
    this.logger.log(`Autocadastro de ${mascararEmail(usuario.email)}`);
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'USUARIO_AUTOCADASTRO',
      entidade: 'Usuario',
      entidadeId: usuario.id,
      dados: { email: usuario.email, papel: usuario.papel },
    });
    return usuarioPublico(usuario);
  }
}
