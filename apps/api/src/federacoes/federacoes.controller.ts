import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('federacoes')
@ApiBearerAuth()
@Controller('federacoes')
export class FederacoesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Lista federações com a contagem de EJs.' })
  async listar() {
    const feds = await this.prisma.federacao.findMany({
      orderBy: { sigla: 'asc' },
      include: { _count: { select: { empresas: true } } },
    });
    return feds.map(({ _count, ...f }) => ({ ...f, totalEmpresas: _count.empresas }));
  }
}
