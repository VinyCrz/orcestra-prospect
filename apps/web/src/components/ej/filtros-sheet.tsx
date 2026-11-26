'use client';
import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
          <SheetDescription>Combine critérios; eles ficam na URL para compartilhar.</SheetDescription>
        </SheetHeader>
        <div className="-mx-2 grid flex-1 content-start gap-5 overflow-y-auto px-2">
          <div className="grid gap-2 rounded-lg border p-3">
            <CheckGroup
              legenda="Canais de contato"
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
            <Label htmlFor="f-canais-modo" className="text-xs text-muted-foreground">
              Como combinar os canais marcados
            </Label>
            <Select
              value={rascunho.canaisModo ?? 'algum'}
              onValueChange={(v) => set('canaisModo', v === 'algum' ? undefined : v)}
              disabled={!rascunho.canais}
            >
              <SelectTrigger id="f-canais-modo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="algum">Tem pelo menos um deles</SelectItem>
                <SelectItem value="todos">Tem todos eles</SelectItem>
                <SelectItem value="apenas">Tem só esses (nenhum outro canal)</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
          <CheckGroup
            legenda="Região"
            valor={listaDe(rascunho.regiao)}
            onChange={(v) => set('regiao', juntar(v))}
            opcoes={(base.data?.regioes ?? []).map((r) => ({
              valor: r.regiao,
              rotulo: REGIAO_LABEL[r.regiao as Regiao] ?? r.regiao,
              detalhe: `(${r.total})`,
            }))}
            carregando={base.isLoading}
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
            legenda="Status"
            valor={listaDe(rascunho.status)}
            onChange={(v) => set('status', juntar(v))}
            opcoes={Object.entries(STATUS_PROSPECCAO_LABEL).map(([valor, rotulo]) => ({
              valor,
              rotulo,
            }))}
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
          <CheckGroup
            legenda="Faixa de ICP"
            valor={listaDe(rascunho.faixaIcp)}
            onChange={(v) => set('faixaIcp', juntar(v))}
            opcoes={FAIXAS_ICP.map((f) => ({ valor: f, rotulo: `Faixa ${f}` }))}
          />
          <div className="grid gap-2">
            <Label htmlFor="f-federada">Federada</Label>
            <Select
              value={rascunho.federada ?? QUALQUER}
              onValueChange={(v) => set('federada', v === QUALQUER ? undefined : v)}
            >
              <SelectTrigger id="f-federada">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={QUALQUER}>Todas</SelectItem>
                <SelectItem value="true">Somente federadas</SelectItem>
                <SelectItem value="false">Somente não federadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FaixaNumerica
            legenda="Nº de membros"
            idBase="membros"
            min={rascunho.membrosMin}
            max={rascunho.membrosMax}
            onMin={(v) => set('membrosMin', v)}
            onMax={(v) => set('membrosMax', v)}
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
