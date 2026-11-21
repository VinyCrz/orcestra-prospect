'use client';
import { Plus, Trash2 } from 'lucide-react';
import {
  CAMPOS_SITE_REDES,
  CARGO_CONTATO_LABEL,
  CARGOS_DECISORES,
  REGIAO_LABEL,
  REGIOES,
  UFS,
  type CargoContato,
  type CriterioIcp,
  type Regiao,
} from '@orcestra/shared';
import { useOpcoesTags } from '@/components/ej/use-opcoes';
import { Button } from '@/components/ui/button';
import { CheckGroup } from '@/components/ui/check-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Params = Record<string, unknown>;
interface Props {
  chave: CriterioIcp;
  idBase: string;
  value: Params;
  onChange: (v: Params) => void;
}

const CAMPO_LABEL: Record<string, string> = {
  site: 'Site',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
};
const NENHUMA = 'nenhuma';

/** Entrada numérica: vazio vira NaN (o schema acusa) ou o valor padrão informado. */
function Num({
  id,
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  id: string;
  label: string;
  value: unknown;
  onChange: (n: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        placeholder={placeholder}
        value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  );
}

function FaixasMembros({ idBase, value, onChange }: Omit<Props, 'chave'>) {
  type Faixa = { min: number; max: number | null; percentual: number };
  const faixas = (value.faixas as Faixa[] | undefined) ?? [];
  const set = (f: Faixa[]) => onChange({ ...value, faixas: f });
  const alterar = (i: number, p: Partial<Faixa>) => set(faixas.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div className="grid gap-3">
      {faixas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma faixa: este critério não pontuará.</p>
      )}
      {faixas.map((f, i) => (
        <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Num id={`${idBase}-min-${i}`} label="Membros de" min={0} value={f.min} onChange={(n) => alterar(i, { min: n ?? NaN })} />
          <Num
            id={`${idBase}-max-${i}`}
            label="até (vazio = sem limite)"
            min={0}
            value={f.max}
            onChange={(n) => alterar(i, { max: n })}
          />
          <Num
            id={`${idBase}-pct-${i}`}
            label="% do peso"
            min={0}
            max={100}
            value={f.percentual}
            onChange={(n) => alterar(i, { percentual: n ?? NaN })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remover faixa ${i + 1}`}
            onClick={() => set(faixas.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => set([...faixas, { min: 0, max: null, percentual: 100 }])}
      >
        <Plus /> Adicionar faixa
      </Button>
    </div>
  );
}

function Areas({ value, onChange }: Omit<Props, 'chave' | 'idBase'>) {
  const tags = useOpcoesTags();
  return (
    <CheckGroup
      legenda="Áreas, cursos e tags alinhados"
      valor={(value.tagIds as string[] | undefined) ?? []}
      onChange={(v) => onChange({ ...value, tagIds: v })}
      opcoes={(tags.data ?? []).map((t) => ({ valor: t.id, rotulo: t.nome, detalhe: `(${t.total})` }))}
      carregando={tags.isLoading}
      vazio={tags.isError ? 'Erro ao carregar tags' : 'Nenhuma tag cadastrada'}
      buscavel
    />
  );
}

export function ParametrosEditor({ chave, idBase, value, onChange }: Props) {
  switch (chave) {
    case 'FEDERADA':
    case 'DADOS_VERIFICADOS':
      return <p className="text-sm text-muted-foreground">Sem parâmetros: pontua o peso cheio quando verdadeiro.</p>;
    case 'FAIXA_MEMBROS':
      return <FaixasMembros idBase={idBase} value={value} onChange={onChange} />;
    case 'AREAS_ALINHADAS':
      return <Areas value={value} onChange={onChange} />;
    case 'REGIAO_PRIORITARIA':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <CheckGroup
            legenda="Regiões prioritárias"
            valor={(value.regioes as string[] | undefined) ?? []}
            onChange={(v) => onChange({ ...value, regioes: v })}
            opcoes={REGIOES.map((r) => ({ valor: r, rotulo: REGIAO_LABEL[r as Regiao] }))}
          />
          <CheckGroup
            legenda="UFs prioritárias"
            valor={(value.ufs as string[] | undefined) ?? []}
            onChange={(v) => onChange({ ...value, ufs: v })}
            opcoes={UFS.map((u) => ({ valor: u.sigla, rotulo: `${u.sigla} — ${u.nome}` }))}
            buscavel
          />
        </div>
      );
    case 'IES_PUBLICA_PRIVADA':
      return (
        <div className="grid max-w-xs gap-2">
          <Label htmlFor={`${idBase}-pref`}>Preferência</Label>
          <Select
            value={(value.preferencia as string | null | undefined) ?? NENHUMA}
            onValueChange={(v) => onChange({ ...value, preferencia: v === NENHUMA ? null : v })}
          >
            <SelectTrigger id={`${idBase}-pref`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUMA}>Nenhuma (não pontua)</SelectItem>
              <SelectItem value="PUBLICA">IES pública</SelectItem>
              <SelectItem value="PRIVADA">IES privada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    case 'TEM_SITE_REDES':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <CheckGroup
            legenda="Canais considerados"
            valor={(value.campos as string[] | undefined) ?? []}
            onChange={(v) => onChange({ ...value, campos: v })}
            opcoes={CAMPOS_SITE_REDES.map((c) => ({ valor: c, rotulo: CAMPO_LABEL[c] }))}
          />
          <Num
            id={`${idBase}-minimo`}
            label="Mínimo de canais preenchidos"
            min={1}
            max={4}
            value={value.minimo}
            onChange={(n) => onChange({ ...value, minimo: n ?? NaN })}
          />
        </div>
      );
    case 'TEM_DECISOR':
      return (
        <CheckGroup
          legenda="Cargos de decisão"
          valor={(value.cargos as string[] | undefined) ?? []}
          onChange={(v) => onChange({ ...value, cargos: v })}
          opcoes={CARGOS_DECISORES.map((c) => ({
            valor: c,
            rotulo: CARGO_CONTATO_LABEL[c as CargoContato] ?? c,
          }))}
        />
      );
    case 'INTERACAO_30D':
      return (
        <div className="max-w-xs">
          <Num
            id={`${idBase}-dias`}
            label="Janela em dias"
            min={1}
            max={365}
            value={value.dias}
            onChange={(n) => onChange({ ...value, dias: n ?? NaN })}
          />
        </div>
      );
  }
}
