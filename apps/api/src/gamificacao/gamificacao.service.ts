import { Injectable, NotFoundException } from '@nestjs/common';
import type { ConquistasQuery, SemanaQuery } from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { intervaloDaSemana, semanaIsoDe } from '../common/semana';
import { PrismaService } from '../prisma/prisma.service';
import { calcularProgresso, contarSemana, montarRanking } from './contagem';
import { MetasService } from './metas.service';

@Injectable()
export class GamificacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metas: MetasService,
  ) {}

  /** SDR sempre o próprio; GESTOR/ADMIN: responsavelId ou o próprio. */
  async semana(q: SemanaQuery, u: UsuarioAutenticado) {
    const alvo = u.papel === 'SDR' ? u.id : (q.responsavelId ?? u.id);
    const semana = q.semana ?? semanaIsoDe(new Date());
    const { ini, fim, segunda } = intervaloDaSemana(semana);
    const [c] = await contarSemana(this.prisma, ini, fim, alvo);
    if (!c) throw new NotFoundException('Usuário não encontrado');
    const meta = await this.metas.efetiva(alvo, segunda);
    return {
      semana,
      usuarioId: alvo,
      interacoes: c.interacoes,
      reunioes: c.reunioes,
      metaInteracoes: meta.interacoesSemana,
      metaReunioes: meta.reunioesSemana,
      origemMeta: meta.origem,
      ...calcularProgresso(c.interacoes, c.reunioes, meta.interacoesSemana, meta.reunioesSemana),
    };
  }

  /** Pontos = interações + 5 × reuniões; empate por reuniões, depois nome. Só SDRs ativos. */
  async ranking(semanaParam: string | undefined) {
    const semana = semanaParam ?? semanaIsoDe(new Date());
    const { ini, fim } = intervaloDaSemana(semana);
    const itens = montarRanking(await contarSemana(this.prisma, ini, fim));
    return { semana, formula: 'pontos = interações + 5 × reuniões', itens };
  }

  async conquistas(q: ConquistasQuery, u: UsuarioAutenticado) {
    const alvo = u.papel === 'SDR' ? u.id : (q.usuarioId ?? u.id);
    const [catalogo, minhas] = await Promise.all([
      this.prisma.conquista.findMany({ where: { ativa: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] }),
      this.prisma.conquistaUsuario.groupBy({
        by: ['conquistaChave'],
        where: { usuarioId: alvo },
        _count: { _all: true },
        _min: { conquistadaEm: true },
      }),
    ]);
    const m = new Map(minhas.map((x) => [x.conquistaChave, x]));
    return {
      usuarioId: alvo,
      itens: catalogo.map((c) => {
        const x = m.get(c.chave);
        return {
          chave: c.chave,
          nome: c.nome,
          descricao: c.descricao,
          icone: c.icone,
          repetivel: c.repetivel,
          conquistada: !!x,
          conquistadaEm: x?._min.conquistadaEm ?? null,
          vezes: x?._count._all ?? 0,
        };
      }),
    };
  }
}
