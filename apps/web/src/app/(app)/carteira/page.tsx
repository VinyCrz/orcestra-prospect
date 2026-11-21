'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import { distribuirCarteiraSchema } from '@orcestra/shared';
import { useFiltrosBase, useOpcoesResponsaveis } from '@/components/ej/use-opcoes';
import { SomentePapeis } from '@/components/app-shell';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckGroup } from '@/components/ui/check-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import type { ResultadoCarteira } from '@/lib/tipos';

function CarteiraConteudo() {
  const qc = useQueryClient();
  const resp = useOpcoesResponsaveis();
  const base = useFiltrosBase();
  const [sdrIds, setSdrIds] = useState<string[]>([]);
  const [ufs, setUfs] = useState<string[]>([]);
  const [apenasSem, setApenasSem] = useState(true);
  const [resultado, setResultado] = useState<ResultadoCarteira | null>(null);
  const [erro, setErro] = useState<string>();

  const sdrs = (resp.data?.usuarios ?? []).filter((u) => u.papel === 'SDR');

  const m = useMutation({
    mutationFn: (json: unknown) =>
      api<ResultadoCarteira>('/carteira/distribuir', { method: 'POST', json }),
    onSuccess: (r) => {
      setResultado(r);
      toast.success(`${r.atribuidas} EJ(s) distribuída(s)`);
      void qc.invalidateQueries({ queryKey: ['opcoes-responsaveis'] });
      void qc.invalidateQueries({ queryKey: ['ejs'] });
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Erro ao distribuir'),
  });

  function distribuir() {
    setErro(undefined);
    setResultado(null);
    const r = distribuirCarteiraSchema.safeParse({
      modo: 'RODIZIO',
      sdrIds,
      filtros: ufs.length ? { uf: ufs } : {},
      apenasSemResponsavel: apenasSem,
    });
    if (!r.success) return setErro('Selecione ao menos um SDR.');
    m.mutate(r.data);
  }

  return (
    <>
      <PageHeader
        titulo="Carteira"
        descricao="Distribua EJs entre os SDRs em rodízio por UF. Para atribuir EJs específicas, use a ação em massa na lista de EJs."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rodízio por UF</CardTitle>
            <CardDescription>
              Em cada UF, as EJs são repartidas começando por quem tem menos EJs naquela UF.
              {resp.data && ` ${resp.data.semResponsavel} EJs estão sem responsável.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {resp.isError ? (
              <p className="text-sm text-destructive">Não foi possível carregar os usuários.</p>
            ) : (
              <CheckGroup
                legenda="SDRs participantes"
                valor={sdrIds}
                onChange={setSdrIds}
                opcoes={sdrs.map((u) => ({
                  valor: u.id,
                  rotulo: u.nome,
                  detalhe: `(${u.totalEjs} EJs)`,
                }))}
                carregando={resp.isLoading}
                vazio="Nenhum SDR ativo. Cadastre usuários com o papel SDR."
              />
            )}
            <CheckGroup
              legenda="UFs (vazio = todas)"
              valor={ufs}
              onChange={setUfs}
              opcoes={(base.data?.ufs ?? []).map((u) => ({
                valor: u.uf,
                rotulo: u.uf,
                detalhe: `(${u.total})`,
              }))}
              carregando={base.isLoading}
              buscavel
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="apenas-sem"
                checked={apenasSem}
                onChange={(e) => setApenasSem(e.target.checked)}
              />
              <Label htmlFor="apenas-sem">Apenas EJs sem responsável</Label>
            </div>
            {!apenasSem && (
              <p className="rounded-md bg-accent p-2 text-sm text-accent-foreground">
                Atenção: EJs que já têm responsável também serão redistribuídas.
              </p>
            )}
            {erro && (
              <p className="text-sm text-destructive" role="alert">
                {erro}
              </p>
            )}
            <Button onClick={distribuir} disabled={m.isPending || sdrIds.length === 0}>
              {m.isPending ? <Loader2 className="animate-spin" /> : <Shuffle />}
              Distribuir
            </Button>
          </CardContent>
        </Card>

        <Card aria-live="polite">
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            {!resultado ? (
              <p className="text-sm text-muted-foreground">
                O resumo da distribuição aparece aqui.
              </p>
            ) : (
              <div className="grid gap-3">
                <p className="text-sm">
                  {resultado.selecionadas} EJ(s) elegíveis · {resultado.atribuidas} atribuída(s) ·{' '}
                  {resultado.semMudanca} sem mudança.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SDR</TableHead>
                      <TableHead className="text-right">EJs</TableHead>
                      <TableHead>Por UF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.resumo.map((s) => (
                      <TableRow key={s.sdrId}>
                        <TableCell className="font-medium">{s.nome}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.atribuidas}</TableCell>
                        <TableCell className="text-xs break-words whitespace-normal text-muted-foreground">
                          {Object.entries(s.porUf)
                            .sort((a, b) => b[1] - a[1])
                            .map(([uf, n]) => `${uf}: ${n}`)
                            .join(' · ') || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function CarteiraPage() {
  return (
    <SomentePapeis papeis={['ADMIN', 'GESTOR']}>
      <CarteiraConteudo />
    </SomentePapeis>
  );
}
