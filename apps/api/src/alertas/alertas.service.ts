import { Injectable, Logger } from '@nestjs/common';
import { OrigemTarefa, Prisma } from '@prisma/client';
import { dataColunaHoje, inicioDoDiaSP, somarDias } from '../common/fuso';
import { PrismaService } from '../prisma/prisma.service';

export const JANELA_MANDATO_DIAS = 30;
export const JANELA_NUTRICAO_DIAS = 3;
/** Prazo (dias) dado ao SDR para agir num alerta de mandato; limitado ao fim do mandato. */
export const PRAZO_MANDATO_DIAS = 7;
const LOTE = 500;

export interface ResultadoAlerta {
  candidatos: number;
  criadas: number;
  /** já existia tarefa com a mesma chave (execução anterior) */
  jaExistentes: number;
  semResponsavel: number;
}
export interface ResultadoAlertas {
  executadoEm: Date;
  mandato: ResultadoAlerta;
  nutricao: ResultadoAlerta;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Chaves de idempotência: uma tarefa por (contato, fim de mandato) e por (EJ, data de retorno). */
export const chaveMandato = (contatoId: string, mandatoFim: Date) => `mandato:${contatoId}:${dia(mandatoFim)}`;
export const chaveNutricao = (ejId: string, retorno: Date) => `nutricao:${ejId}:${dia(retorno)}`;

@Injectable()
export class AlertasService {
  private readonly log = new Logger(AlertasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Idempotente: reexecutar no mesmo dia (ou em dias seguintes) não duplica tarefas (chave única). */
  async executar(agora = new Date()): Promise<ResultadoAlertas> {
    const [mandato, nutricao] = [await this.alertarMandatos(agora), await this.alertarNutricao(agora)];
    this.log.log(
      `Alertas: mandato ${mandato.criadas} novas/${mandato.semResponsavel} sem responsável; ` +
        `nutrição ${nutricao.criadas} novas/${nutricao.semResponsavel} sem responsável`,
    );
    return { executadoEm: agora, mandato, nutricao };
  }

  private async alertarMandatos(agora: Date): Promise<ResultadoAlerta> {
    const hoje = dataColunaHoje(agora);
    const contatos = await this.prisma.contato.findMany({
      where: {
        mandatoFim: { gte: hoje, lte: somarDias(hoje, JANELA_MANDATO_DIAS) },
        optOut: false,
        anonimizadoEm: null,
      },
      select: {
        id: true,
        nome: true,
        mandatoFim: true,
        empresaJuniorId: true,
        empresaJunior: { select: { nome: true, responsavel: { select: { id: true, ativo: true } } } },
      },
    });
    const dados: Prisma.TarefaCreateManyInput[] = [];
    let semResponsavel = 0;
    for (const c of contatos) {
      const resp = c.empresaJunior.responsavel;
      if (!resp?.ativo) {
        semResponsavel++;
        continue;
      }
      const fim = c.mandatoFim!;
      const prazo = somarDias(inicioDoDiaSP(agora), PRAZO_MANDATO_DIAS);
      const fimDia = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate(), 3));
      dados.push({
        titulo: `Mandato vencendo em ${dia(fim).split('-').reverse().join('/')}: ${c.empresaJunior.nome}`,
        descricao: 'Confirmar a renovação da diretoria e atualizar o contato.',
        vencimento: fimDia < prazo ? fimDia : prazo,
        origem: OrigemTarefa.MANDATO_VENCENDO,
        chaveIdempotencia: chaveMandato(c.id, fim),
        responsavelId: resp.id,
        empresaJuniorId: c.empresaJuniorId,
        contatoId: c.id,
      });
    }
    return this.gravar(dados, contatos.length, semResponsavel);
  }

  private async alertarNutricao(agora: Date): Promise<ResultadoAlerta> {
    const limite = somarDias(dataColunaHoje(agora), JANELA_NUTRICAO_DIAS);
    const ejs = await this.prisma.empresaJunior.findMany({
      where: { statusProspeccao: 'NUTRICAO', dataRetornoNutricao: { not: null, lte: limite } }, // inclui atrasadas
      select: {
        id: true,
        nome: true,
        dataRetornoNutricao: true,
        responsavel: { select: { id: true, ativo: true } },
      },
    });
    const dados: Prisma.TarefaCreateManyInput[] = [];
    let semResponsavel = 0;
    for (const e of ejs) {
      if (!e.responsavel?.ativo) {
        semResponsavel++;
        continue;
      }
      const retorno = e.dataRetornoNutricao!;
      dados.push({
        titulo: `Retomar contato (nutrição): ${e.nome}`,
        descricao: `Data de retorno combinada: ${dia(retorno).split('-').reverse().join('/')}.`,
        vencimento: new Date(Date.UTC(retorno.getUTCFullYear(), retorno.getUTCMonth(), retorno.getUTCDate(), 3)),
        origem: OrigemTarefa.NUTRICAO_RETORNO,
        chaveIdempotencia: chaveNutricao(e.id, retorno),
        responsavelId: e.responsavel.id,
        empresaJuniorId: e.id,
      });
    }
    return this.gravar(dados, ejs.length, semResponsavel);
  }

  private async gravar(
    dados: Prisma.TarefaCreateManyInput[],
    candidatos: number,
    semResponsavel: number,
  ): Promise<ResultadoAlerta> {
    let criadas = 0;
    for (let i = 0; i < dados.length; i += LOTE) {
      const r = await this.prisma.tarefa.createMany({ data: dados.slice(i, i + LOTE), skipDuplicates: true });
      criadas += r.count;
    }
    return { candidatos, criadas, jaExistentes: dados.length - criadas, semResponsavel };
  }
}
