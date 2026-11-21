'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Loader2, RotateCcw, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  LIMITE_ARQUIVO_IMPORTACAO,
  mapeamentoImportacaoSchema,
  TIPOS_IMPORTACAO,
  type TipoImportacao,
} from '@orcestra/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError, baixarArquivo } from '@/lib/api';
import type {
  ImportacaoDetalhe,
  ImportacaoPrevia,
  ImportacaoUpload,
} from '@/lib/tipos';

export const TIPO_LABEL: Record<TipoImportacao, string> = {
  EJS: 'Empresas Juniores',
  CONTATOS: 'Contatos',
};
const IGNORAR = '__ignorar__';
const ATIVAS = ['PENDENTE', 'PROCESSANDO'];

export function BotaoErrosCsv({ id }: { id: string }) {
  const m = useMutation({
    mutationFn: () => baixarArquivo(`/importacoes/${id}/erros.csv`, `importacao-${id}-erros.csv`),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao baixar'),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? <Loader2 className="animate-spin" /> : <Download />}
      Baixar erros.csv
    </Button>
  );
}

type Etapa = 'upload' | 'mapeamento' | 'previa' | 'progresso';
const ETAPAS: { id: Etapa; rotulo: string }[] = [
  { id: 'upload', rotulo: '1. Arquivo' },
  { id: 'mapeamento', rotulo: '2. Mapeamento' },
  { id: 'previa', rotulo: '3. Pré-visualização' },
  { id: 'progresso', rotulo: '4. Processamento' },
];

export function WizardImportacao() {
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [tipo, setTipo] = useState<TipoImportacao>('EJS');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string>();
  const [upload, setUpload] = useState<ImportacaoUpload | null>(null);
  const [mapa, setMapa] = useState<Record<string, string | null>>({});
  const [estrategia, setEstrategia] = useState<'MESCLAR' | 'IGNORAR'>('IGNORAR');
  const [erroMapa, setErroMapa] = useState<string>();
  const [previa, setPrevia] = useState<ImportacaoPrevia | null>(null);

  function reiniciar() {
    setEtapa('upload');
    setArquivo(null);
    setUpload(null);
    setPrevia(null);
    setMapa({});
    setErroMapa(undefined);
  }

  const enviar = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.set('tipo', tipo);
      fd.set('arquivo', arquivo!);
      return api<ImportacaoUpload>('/importacoes', { method: 'POST', corpo: fd });
    },
    onSuccess: (u) => {
      setUpload(u);
      setMapa(u.mapeamentoSugerido);
      setEtapa('mapeamento');
    },
    onError: (e) => setErroArquivo(e instanceof ApiError ? e.message : 'Erro ao enviar o arquivo'),
  });

  const mapear = useMutation({
    mutationFn: (json: unknown) =>
      api<ImportacaoPrevia>(`/importacoes/${upload!.id}/mapeamento`, { method: 'PUT', json }),
    onSuccess: (p) => {
      setPrevia(p);
      setEtapa('previa');
    },
    onError: (e) => setErroMapa(e instanceof ApiError ? e.message : 'Erro ao validar o mapeamento'),
  });

  const processar = useMutation({
    mutationFn: () => api(`/importacoes/${upload!.id}/processar`, { method: 'POST' }),
    onSuccess: () => {
      setEtapa('progresso');
      void qc.invalidateQueries({ queryKey: ['importacoes'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao processar'),
  });

  function aoEscolherArquivo(f: File | null) {
    setErroArquivo(undefined);
    if (f && f.size > LIMITE_ARQUIVO_IMPORTACAO) {
      setArquivo(null);
      return setErroArquivo('O arquivo excede 10 MB.');
    }
    if (f && !/\.(csv|xlsx)$/i.test(f.name)) {
      setArquivo(null);
      return setErroArquivo('Use um arquivo .csv ou .xlsx.');
    }
    setArquivo(f);
  }

  function confirmarMapeamento() {
    setErroMapa(undefined);
    const r = mapeamentoImportacaoSchema.safeParse({
      mapeamento: mapa,
      estrategiaDuplicados: estrategia,
    });
    if (!r.success) return setErroMapa('Mapeamento inválido.');
    const faltando = upload!.camposDisponiveis
      .filter((c) => c.obrigatorio && !Object.values(mapa).includes(c.campo))
      .map((c) => c.rotulo);
    if (faltando.length) return setErroMapa(`Mapeie o campo obrigatório: ${faltando.join(', ')}.`);
    mapear.mutate(r.data);
  }

  const idxEtapa = ETAPAS.findIndex((e) => e.id === etapa);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova importação</CardTitle>
        <ol className="flex flex-wrap gap-2 pt-1" aria-label="Etapas da importação">
          {ETAPAS.map((e, i) => (
            <li key={e.id} aria-current={e.id === etapa ? 'step' : undefined}>
              <Badge variant={i === idxEtapa ? 'default' : i < idxEtapa ? 'brand' : 'outline'}>
                {e.rotulo}
              </Badge>
            </li>
          ))}
        </ol>
      </CardHeader>
      <CardContent className="grid gap-4">
        {etapa === 'upload' && (
          <form
            className="grid max-w-xl gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!arquivo) return setErroArquivo('Selecione um arquivo.');
              enviar.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="imp-tipo">O que importar</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoImportacao)}>
                <SelectTrigger id="imp-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_IMPORTACAO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="imp-arquivo">Arquivo (.csv ou .xlsx, até 10 MB)</Label>
              <Input
                id="imp-arquivo"
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => aoEscolherArquivo(e.target.files?.[0] ?? null)}
                aria-invalid={!!erroArquivo}
              />
              {erroArquivo && (
                <p className="text-sm text-destructive" role="alert">
                  {erroArquivo}
                </p>
              )}
            </div>
            <Button type="submit" disabled={enviar.isPending} className="w-fit">
              {enviar.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              Enviar e continuar
            </Button>
          </form>
        )}

        {etapa === 'mapeamento' && upload && (
          <>
            <CardDescription>
              {upload.totalLinhas} linha(s) em “{arquivo?.name}”. Associe cada coluna do arquivo a um
              campo do sistema; colunas ignoradas não são importadas.
            </CardDescription>
            {upload.avisoReenvio && (
              <p className="rounded-md bg-accent p-2 text-sm text-accent-foreground">
                Atenção: um arquivo idêntico já foi importado
                {upload.avisoReenvio.concluidaEm
                  ? ` em ${new Date(upload.avisoReenvio.concluidaEm).toLocaleDateString('pt-BR')}`
                  : ''}
                .
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {upload.colunas.map((col, i) => (
                <div key={col} className="grid gap-1.5">
                  <Label htmlFor={`map-${i}`} className="break-all">
                    {col}
                  </Label>
                  <Select
                    value={mapa[col] ?? IGNORAR}
                    onValueChange={(v) => setMapa((m) => ({ ...m, [col]: v === IGNORAR ? null : v }))}
                  >
                    <SelectTrigger id={`map-${i}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORAR}>Ignorar coluna</SelectItem>
                      {upload.camposDisponiveis.map((c) => (
                        <SelectItem key={c.campo} value={c.campo}>
                          {c.rotulo}
                          {c.obrigatorio ? ' *' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="grid max-w-sm gap-1.5">
              <Label htmlFor="imp-estrategia">Quando já existir (duplicada)</Label>
              <Select value={estrategia} onValueChange={(v) => setEstrategia(v as typeof estrategia)}>
                <SelectTrigger id="imp-estrategia">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IGNORAR">Ignorar a linha</SelectItem>
                  <SelectItem value="MESCLAR">Mesclar (preencher campos vazios)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {upload.amostra.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {upload.colunas.map((c) => (
                        <TableHead key={c}>{c}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upload.amostra.slice(0, 3).map((l, i) => (
                      <TableRow key={i}>
                        {upload.colunas.map((c) => (
                          <TableCell key={c} className="max-w-48 truncate">
                            {String(l[c] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {erroMapa && (
              <p className="text-sm text-destructive" role="alert">
                {erroMapa}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={reiniciar}>
                Cancelar
              </Button>
              <Button onClick={confirmarMapeamento} disabled={mapear.isPending}>
                {mapear.isPending && <Loader2 className="animate-spin" />}
                Pré-visualizar
              </Button>
            </div>
          </>
        )}

        {etapa === 'previa' && previa && (
          <>
            <div className="grid grid-cols-3 gap-3" data-testid="contagens-previa">
              <Contagem rotulo="Novas" valor={previa.novas} cor="text-success" />
              <Contagem rotulo="Duplicadas" valor={previa.duplicadas} cor="text-foreground" />
              <Contagem rotulo="Com erro" valor={previa.comErro} cor="text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground">
              {previa.totalLinhas} linha(s) · duplicadas serão{' '}
              {estrategia === 'MESCLAR' ? 'mescladas' : 'ignoradas'}. Linhas com erro não são
              importadas.
            </p>
            {previa.errosFrequentes.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-destructive">
                {previa.errosFrequentes.map((e) => (
                  <li key={e.mensagem}>
                    {e.mensagem} ({e.quantidade}x)
                  </li>
                ))}
              </ul>
            )}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Dados</TableHead>
                    <TableHead>Problemas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.amostra.map((l) => (
                    <TableRow key={l.linha}>
                      <TableCell className="tabular-nums">{l.linha}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            l.status === 'NOVA'
                              ? 'success'
                              : l.status === 'ERRO'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {l.status === 'NOVA'
                            ? 'Nova'
                            : l.status === 'ERRO'
                              ? 'Erro'
                              : 'Duplicada'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">
                        {String(l.dados?.nome ?? l.dados?.ejNome ?? '—')}
                      </TableCell>
                      <TableCell className="text-sm text-destructive">
                        {l.erros.map((e) => e.mensagem).join('; ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">Exibindo as primeiras linhas.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEtapa('mapeamento')}>
                Voltar ao mapeamento
              </Button>
              <Button
                onClick={() => processar.mutate()}
                disabled={processar.isPending || previa.novas + previa.duplicadas === 0}
              >
                {processar.isPending && <Loader2 className="animate-spin" />}
                Processar importação
              </Button>
            </div>
          </>
        )}

        {etapa === 'progresso' && upload && (
          <Progresso id={upload.id} onNova={reiniciar} />
        )}
      </CardContent>
    </Card>
  );
}

function Contagem({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <p className={`text-2xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function Progresso({ id, onNova }: { id: string; onNova: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['importacao', id],
    queryFn: () => api<ImportacaoDetalhe>(`/importacoes/${id}`),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return !s || ATIVAS.includes(s) ? 1500 : false;
    },
  });
  const d = q.data;
  const terminou = d && !ATIVAS.includes(d.status);
  useEffect(() => {
    if (terminou) void qc.invalidateQueries({ queryKey: ['importacoes'] });
  }, [terminou, qc]);

  if (q.isError && !d)
    return <p className="text-sm text-destructive">Não foi possível consultar o progresso.</p>;
  if (!d)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Consultando…
      </p>
    );

  return (
    <div className="grid gap-4" aria-live="polite">
      <div className="flex items-center gap-2 font-medium">
        {d.status === 'CONCLUIDA' ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : d.status === 'FALHOU' ? (
          <XCircle className="size-5 text-destructive" />
        ) : (
          <Loader2 className="size-5 animate-spin text-primary" />
        )}
        {d.status === 'CONCLUIDA'
          ? 'Importação concluída'
          : d.status === 'FALHOU'
            ? 'A importação falhou'
            : 'Processando…'}
      </div>
      <div
        role="progressbar"
        aria-valuenow={d.percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso da importação"
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${d.percentual}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">
        {d.processadas} de {d.totalLinhas} linhas ({d.percentual}%) · {d.importadas} importadas ·{' '}
        {d.atualizadas} atualizadas · {d.ignoradas} ignoradas · {d.erros} com erro
      </p>
      {d.mensagemErro && <p className="text-sm text-destructive">{d.mensagemErro}</p>}
      {terminou && d.errosAmostra.length > 0 && (
        <ul className="max-h-40 overflow-y-auto text-sm text-destructive">
          {d.errosAmostra.slice(0, 10).map((e, i) => (
            <li key={i}>
              Linha {e.linha}
              {e.campo ? ` (${e.campo})` : ''}: {e.mensagem}
            </li>
          ))}
        </ul>
      )}
      {terminou && (
        <div className="flex flex-wrap gap-2">
          {d.erros > 0 && <BotaoErrosCsv id={id} />}
          <Button variant="outline" size="sm" onClick={onNova}>
            <RotateCcw /> Nova importação
          </Button>
        </div>
      )}
    </div>
  );
}
