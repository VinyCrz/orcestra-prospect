'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import {
  CANAIS_CONTATO,
  CANAL_CONTATO_LABEL,
  FAIXAS_ICP,
  REGIAO_LABEL,
  STATUS_PROSPECCAO_LABEL,
  UFS,
  type Regiao,
} from '@orcestra/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckGroup } from '@/components/ui/check-group';
import { ChipGroup } from '@/components/ui/chip-group';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { CHAVES_FILTRO, contarFiltros, listaDe, type FiltrosUrl } from '@/lib/filtros-ej';
import {
  useFederacoes,
  useFiltrosBase,
  useOpcoesIes,
  useOpcoesResponsaveis,
  useOpcoesTags,
} from './use-opcoes';

const QUALQUER = 'qualquer';

function juntar(v: string[]) {
  return v.length ? v.join(',') : undefined;
}

/** Painel com todos os filtros combináveis; só aplica ao clicar em "Aplicar". */
export function FiltrosSheet({
  filtros,
  onAplicar,
}: {
  filtros: FiltrosUrl;
  onAplicar: (f: FiltrosUrl) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<FiltrosUrl>(filtros);
  useEffect(() => {
    if (aberto) setRascunho(filtros);
    // Reinicia o rascunho apenas na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const base = useFiltrosBase();
  const federacoes = useFederacoes();
  const ies = useOpcoesIes(aberto);
  const tags = useOpcoesTags();
  const resp = useOpcoesResponsaveis(aberto);

  const set = (k: keyof FiltrosUrl, v: string | undefined) =>
    setRascunho((r) => ({ ...r, [k]: v || undefined }));
  const total = contarFiltros(filtros);

  // quantos filtros do rascunho caem em cada seção (mostrado no título)
  const ativos = (...ks: (keyof FiltrosUrl)[]) => ks.filter((k) => rascunho[k]).length;
  // abre as seções que já têm filtro; sem nenhum, abre só "Contato"
  const tem = (...ks: (keyof FiltrosUrl)[]) => ks.some((k) => filtros[k]);
  const abertas = {
    prospeccao: tem('status', 'responsavelId', 'faixaIcp', 'scoreMin', 'scoreMax'),
    localizacao: tem('regiao', 'uf', 'federada', 'federacaoId'),
    perfil: tem('iesId', 'tagIds', 'membrosMin', 'membrosMax'),
    contato: false,
  };
  abertas.contato = tem('canais') || total === 0;

  const contagemUf = new Map((base.data?.ufs ?? []).map((u) => [u.uf, u.total]));

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button variant="outline" data-testid="abrir-filtros">
          <SlidersHorizontal /> Filtros
          {total > 0 && <Badge>{total}</Badge>}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Abra uma seção e marque o que procura.</SheetDescription>
        </SheetHeader>
        <div className="-mx-2 flex-1 overflow-y-auto px-2">
          <Secao titulo="Contato" ativos={ativos('canais')} aberta={abertas.contato}>
            <ChipGroup
              legenda="Canais que a EJ tem"
              valor={listaDe(rascunho.canais)}
              onChange={(v) => {
                const lista = juntar(v);
                setRascunho((r) => ({
                  ...r,
                  canais: lista,
                  canaisModo: lista ? r.canaisModo : undefined,
                }));
              }}
              opcoes={CANAIS_CONTATO.map((c) => ({ valor: c, rotulo: CANAL_CONTATO_LABEL[c] }))}
            />
            {rascunho.canais && (
              <ChipGroup
                legenda="Combinar os marcados"
                unico
                valor={[rascunho.canaisModo ?? 'algum']}
                onChange={([v]) => set('canaisModo', v === 'algum' ? undefined : v)}
                opcoes={[
                  { valor: 'algum', rotulo: 'Algum deles' },
                  { valor: 'todos', rotulo: 'Todos eles' },
                  { valor: 'apenas', rotulo: 'Só esses' },
                ]}
              />
            )}
          </Secao>

          <Secao
            titulo="Prospecção"
            ativos={ativos('status', 'responsavelId', 'faixaIcp', 'scoreMin', 'scoreMax')}
            aberta={abertas.prospeccao}
          >
            <ChipGroup
              legenda="Status"
              valor={listaDe(rascunho.status)}
              onChange={(v) => set('status', juntar(v))}
              opcoes={Object.entries(STATUS_PROSPECCAO_LABEL).map(([valor, rotulo]) => ({
                valor,
                rotulo,
              }))}
            />
            <ChipGroup
              legenda="Faixa de ICP"
              valor={listaDe(rascunho.faixaIcp)}
              onChange={(v) => set('faixaIcp', juntar(v))}
              opcoes={FAIXAS_ICP.map((f) => ({ valor: f, rotulo: `Faixa ${f}` }))}
            />
            <FaixaNumerica
              legenda="Score ICP (0–100)"
              idBase="score"
              min={rascunho.scoreMin}
              max={rascunho.scoreMax}
              limite={100}
              onMin={(v) => set('scoreMin', v)}
              onMax={(v) => set('scoreMax', v)}
            />
            <CheckGroup
              legenda="Responsável"
              valor={listaDe(rascunho.responsavelId)}
              onChange={(v) => set('responsavelId', juntar(v))}
              opcoes={[
                { valor: 'eu', rotulo: 'Minha carteira' },
                {
                  valor: 'nenhum',
                  rotulo: 'Sem responsável',
                  detalhe: resp.data ? `(${resp.data.semResponsavel})` : undefined,
                },
                ...(resp.data?.usuarios ?? []).map((u) => ({
                  valor: u.id,
                  rotulo: u.nome,
                  detalhe: `(${u.totalEjs})`,
                })),
              ]}
              carregando={resp.isLoading}
            />
          </Secao>

          <Secao
            titulo="Localização"
            ativos={ativos('regiao', 'uf', 'federada', 'federacaoId')}
            aberta={abertas.localizacao}
          >
            <ChipGroup
              legenda="Região"
              valor={listaDe(rascunho.regiao)}
              onChange={(v) => set('regiao', juntar(v))}
              opcoes={(base.data?.regioes ?? []).map((r) => ({
                valor: r.regiao,
                rotulo: REGIAO_LABEL[r.regiao as Regiao] ?? r.regiao,
                detalhe: String(r.total),
              }))}
            />
            <CheckGroup
              legenda="UF"
              valor={listaDe(rascunho.uf)}
              onChange={(v) => set('uf', juntar(v))}
              opcoes={UFS.map((u) => ({
                valor: u.sigla,
                rotulo: `${u.sigla} — ${u.nome}`,
                detalhe: contagemUf.has(u.sigla) ? `(${contagemUf.get(u.sigla)})` : undefined,
              }))}
              buscavel
            />
            <ChipGroup
              legenda="Federada"
              unico
              valor={[rascunho.federada ?? QUALQUER]}
              onChange={([v]) => set('federada', v === QUALQUER ? undefined : v)}
              opcoes={[
                { valor: QUALQUER, rotulo: 'Todas' },
                { valor: 'true', rotulo: 'Federadas' },
                { valor: 'false', rotulo: 'Não federadas' },
              ]}
            />
            <CheckGroup
              legenda="Federação"
              valor={listaDe(rascunho.federacaoId)}
              onChange={(v) => set('federacaoId', juntar(v))}
              opcoes={[
                ...(federacoes.data ?? []).map((f) => ({
                  valor: f.id,
                  rotulo: f.sigla,
                  detalhe: `(${f.totalEmpresas})`,
                })),
                { valor: 'nenhuma', rotulo: 'Sem federação confirmada' },
              ]}
              carregando={federacoes.isLoading}
              buscavel
            />
          </Secao>

          <Secao
            titulo="Perfil da EJ"
            ativos={ativos('iesId', 'tagIds', 'membrosMin', 'membrosMax')}
            aberta={abertas.perfil}
          >
            <CheckGroup
              legenda="Áreas, cursos e tags"
              valor={listaDe(rascunho.tagIds)}
              onChange={(v) => set('tagIds', juntar(v))}
              opcoes={(tags.data ?? []).map((t) => ({
                valor: t.id,
                rotulo: t.nome,
                detalhe: `(${t.total})`,
              }))}
              carregando={tags.isLoading}
              vazio="Nenhuma tag cadastrada"
              buscavel
            />
            <CheckGroup
              legenda="IES"
              valor={listaDe(rascunho.iesId)}
              onChange={(v) => set('iesId', juntar(v))}
              opcoes={(ies.data ?? []).map((i) => ({
                valor: i.id,
                rotulo: i.sigla ? `${i.sigla} — ${i.nome}` : i.nome,
                detalhe: `(${i.total})`,
              }))}
              carregando={ies.isLoading}
              buscavel
            />
            <FaixaNumerica
              legenda="Nº de membros"
              idBase="membros"
              min={rascunho.membrosMin}
              max={rascunho.membrosMax}
              onMin={(v) => set('membrosMin', v)}
              onMax={(v) => set('membrosMax', v)}
            />
          </Secao>
        </div>
        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => {
              const vazio: FiltrosUrl = {};
              if (filtros.busca) vazio.busca = filtros.busca;
              setRascunho(vazio);
            }}
          >
            Limpar
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              const novo: FiltrosUrl = {};
              for (const k of CHAVES_FILTRO) if (rascunho[k]) novo[k] = rascunho[k];
              onAplicar(novo);
              setAberto(false);
            }}
          >
            Aplicar filtros
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Seção recolhível do painel; o número no título diz quantos filtros dela estão marcados. */
function Secao({
  titulo,
  ativos,
  aberta: abertaInicial,
  children,
}: {
  titulo: string;
  ativos: number;
  aberta: boolean;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(abertaInicial);
  return (
    <details
      open={aberta}
      onToggle={(e) => setAberta(e.currentTarget.open)}
      className="group border-b last:border-b-0"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {titulo}
        {ativos > 0 && <Badge>{ativos}</Badge>}
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 pb-4">{children}</div>
    </details>
  );
}

function FaixaNumerica({
  legenda,
  idBase,
  min,
  max,
  limite,
  onMin,
  onMax,
}: {
  legenda: string;
  idBase: string;
  min?: string;
  max?: string;
  limite?: number;
  onMin: (v: string | undefined) => void;
  onMax: (v: string | undefined) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{legenda}</legend>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={limite}
          placeholder="Mín."
          aria-label={`${legenda} mínimo`}
          id={`${idBase}-min`}
          value={min ?? ''}
          onChange={(e) => onMin(e.target.value || undefined)}
        />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={limite}
          placeholder="Máx."
          aria-label={`${legenda} máximo`}
          id={`${idBase}-max`}
          value={max ?? ''}
          onChange={(e) => onMax(e.target.value || undefined)}
        />
      </div>
    </fieldset>
  );
}
