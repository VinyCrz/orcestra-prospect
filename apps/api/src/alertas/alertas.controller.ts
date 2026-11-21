import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { Papeis } from '../auth/decorators/papeis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { AuditService } from '../common/audit.service';
import { AlertasService } from './alertas.service';

@ApiTags('alertas')
@ApiBearerAuth()
@Controller('alertas')
export class AlertasController {
  constructor(
    private readonly service: AlertasService,
    private readonly audit: AuditService,
  ) {}

  @Post('executar')
  @Papeis('ADMIN')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Executa agora os alertas diários (ADMIN). Idempotente.',
    description:
      'Mandatos de contatos vencendo em 30 dias -> tarefa MANDATO_VENCENDO para o responsável da EJ; EJs em NUTRICAO ' +
      'com retorno em até 3 dias (ou atrasado) -> tarefa NUTRICAO_RETORNO. Resposta: contagens por tipo ' +
      '(`candidatos`, `criadas`, `jaExistentes`, `semResponsavel`). O mesmo job roda todo dia às 06:00 (America/Sao_Paulo).',
  })
  async executar(@UsuarioAtual() u: UsuarioAutenticado) {
    const r = await this.service.executar();
    await this.audit.registrar({
      usuarioId: u.id,
      acao: 'ALERTAS_EXECUTADOS',
      entidade: 'Alertas',
      dados: { mandato: r.mandato, nutricao: r.nutricao } as never,
    });
    return r;
  }
}
