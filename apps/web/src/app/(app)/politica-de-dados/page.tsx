import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Política de dados' };

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>{titulo}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

export default function PoliticaDeDadosPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titulo="Política de dados"
        descricao="Como a plataforma obtém, usa e protege os dados da base de Empresas Juniores."
      />
      <div className="grid gap-4">
        <Secao titulo="Fonte dos dados">
          <p>
            A base é montada somente a partir de fontes públicas, sem login e respeitando o
            robots.txt: cadastro nacional da Brasil Júnior, páginas e APIs públicas das federações
            (por exemplo FEJERS e RioJunior), sites das próprias Empresas Juniores, dados cadastrais
            públicos da Receita Federal (via BrasilAPI) e grafia oficial de cidades do IBGE.
          </p>
          <p>
            Toda Empresa Júnior guarda a URL da fonte e a data da coleta. Campo não confirmado fica
            vazio: nada é inventado.
          </p>
        </Secao>

        <Secao titulo="Base legal">
          <p>
            O tratamento se apoia no <strong>legítimo interesse</strong> (LGPD, art. 7º, IX) para
            contato institucional entre organizações (B2B), com finalidade restrita à prospecção de
            serviços para Empresas Juniores. A base legal de cada contato fica registrada no seu
            cadastro. O titular pode se opor a qualquer momento (veja &quot;Direitos do titular&quot;).
          </p>
        </Secao>

        <Secao titulo="Dados tratados">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Dados da organização: nome, CNPJ, cidade, UF, instituição de ensino, site, redes
              institucionais.
            </li>
            <li>
              Dados de contato apenas institucionais ou profissionais: e-mails com o nome da EJ ou
              <em> contato@</em> e telefones fixos. Celulares pessoais e quadro societário da Receita
              são descartados na coleta.
            </li>
            <li>
              Contatos de pessoas (nome, cargo, e-mail, telefone) só são cadastrados manualmente ou
              por importação, com fonte e base legal informadas.
            </li>
          </ul>
        </Secao>

        <Secao titulo="Retenção">
          <p>
            Contatos com mandato encerrado há mais de 24 meses e sem interação nos últimos 24 meses
            são listados como candidatos à anonimização. <strong>Nada é excluído
            automaticamente</strong>: o administrador revisa a lista e decide caso a caso. A
            anonimização remove os dados pessoais e preserva apenas o histórico sem vínculo pessoal.
          </p>
        </Secao>

        <Secao titulo="Direitos do titular">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Acesso/exportação:</strong> gestor ou administrador exporta os dados do contato
              em JSON, na ficha do contato.
            </li>
            <li>
              <strong>Eliminação:</strong> gestor ou administrador anonimiza o contato de forma
              definitiva, na ficha do contato ou na tela de retenção.
            </li>
            <li>
              <strong>Oposição (opt-out):</strong> qualquer usuário registra o opt-out, informando o
              motivo. Só gestor ou administrador pode desfazê-lo.
            </li>
          </ul>
          <p>
            Para exercer esses direitos, o titular deve escrever ao contato abaixo; a equipe atende
            o pedido na plataforma.
          </p>
        </Secao>

        <Secao titulo="Opt-out e lista de supressão">
          <p>
            Contato em opt-out ou anonimizado fica bloqueado em toda a plataforma: links de e-mail,
            WhatsApp e LinkedIn são desativados, cadências são encerradas, tarefas pendentes são
            canceladas, mensagens não são geradas e o contato não pode ser recriado ou reimportado.
            Para isso, a plataforma guarda apenas hashes irreversíveis de e-mail e telefone.
          </p>
        </Secao>

        <Secao titulo="Responsável">
          <p>Encarregado de dados (DPO): [preencher: e-mail do encarregado/DPO]</p>
        </Secao>
      </div>
    </div>
  );
}
