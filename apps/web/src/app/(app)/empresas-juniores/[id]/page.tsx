'use client';
import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  ExternalLink,
  Globe,
  Instagram,
  Linkedin,
  Facebook,
  Mail,
  Phone,
} from 'lucide-react';
import { formatarCnpj, REGIAO_LABEL, type Regiao } from '@orcestra/shared';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import type { EmpresaJuniorDetalhe } from '@/lib/tipos';

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function Vazio() {
  return <span className="text-muted-foreground">Não informado</span>;
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  const vazio = children === null || children === undefined || children === '';
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm break-words">{vazio ? <Vazio /> : children}</dd>
    </div>
  );
}

function LinkExterno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

export default function DetalheEjPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ['ej', id],
    queryFn: () => api<EmpresaJuniorDetalhe>(`/empresas-juniores/${id}`),
  });

  const voltar = (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href="/empresas-juniores">
        <ArrowLeft /> Empresas Juniores
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div className="grid gap-4">
        {voltar}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div>
        {voltar}
        <p className="text-destructive">
          {q.error instanceof ApiError && q.error.status === 404
            ? 'Empresa Júnior não encontrada.'
            : 'Erro ao carregar a Empresa Júnior.'}
        </p>
      </div>
    );
  }

  const ej = q.data;
  const areas = ej.tags.filter((t) => t.tipo === 'AREA');
  const cursos = ej.tags.filter((t) => t.tipo === 'CURSO');
  const canais = [
    ej.site && {
      icon: Globe,
      label: 'Site',
      href: ej.site,
      texto: ej.site.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    },
    ej.instagram && {
      icon: Instagram,
      label: 'Instagram',
      href: ej.instagram,
      texto: ej.instagram.replace(/^https:\/\/www\.instagram\.com\//, '@').replace(/\/$/, ''),
    },
    ej.linkedin && { icon: Linkedin, label: 'LinkedIn', href: ej.linkedin, texto: 'LinkedIn' },
    ej.facebook && { icon: Facebook, label: 'Facebook', href: ej.facebook, texto: 'Facebook' },
  ].filter(Boolean) as { icon: typeof Globe; label: string; href: string; texto: string }[];

  return (
    <div className="mx-auto max-w-5xl">
      {voltar}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {ej.nome}
            {ej.verificado && (
              <BadgeCheck className="size-5 text-primary" aria-label="Verificada" />
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[ej.ies?.nome, [ej.cidade, ej.uf].filter(Boolean).join(' / ')]
              .filter(Boolean)
              .join(' · ') || 'Localização não informada'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={ej.statusProspeccao} />
          <Badge variant="outline">Score ICP: {ej.scoreIcp}</Badge>
          {ej.federacao && <Badge variant="brand">{ej.federacao.sigla}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Dados da organização</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Linha rotulo="Razão social">{ej.razaoSocial}</Linha>
                <Linha rotulo="CNPJ">{formatarCnpj(ej.cnpj)}</Linha>
                <Linha rotulo="Situação cadastral">{ej.situacaoCadastral}</Linha>
                <Linha rotulo="IES">
                  {ej.ies && `${ej.ies.nome}${ej.ies.sigla ? ` (${ej.ies.sigla})` : ''}`}
                </Linha>
                <Linha rotulo="Federação">{ej.federacao?.nome}</Linha>
                <Linha rotulo="Núcleo">{ej.nucleo?.nome}</Linha>
                <Linha rotulo="Federada">
                  {ej.federada ? 'Sim' : ej.federacao ? 'Sim' : 'Não confirmado'}
                </Linha>
                <Linha rotulo="Cidade / UF">{[ej.cidade, ej.uf].filter(Boolean).join(' / ')}</Linha>
                <Linha rotulo="Região">{ej.regiao && REGIAO_LABEL[ej.regiao as Regiao]}</Linha>
                <Linha rotulo="Ano de fundação">{ej.anoFundacao}</Linha>
                <Linha rotulo="Membros (estimativa)">{ej.membrosEstimados}</Linha>
                <Linha rotulo="ID Brasil Júnior">{ej.idBrasilJunior}</Linha>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Atuação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Áreas</p>
                {areas.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {areas.map((t) => (
                      <Badge key={t.id} variant="secondary">
                        {t.nome}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Vazio />
                )}
              </div>
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Cursos</p>
                {cursos.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {cursos.map((t) => (
                      <Badge key={t.id} variant="outline">
                        {t.nome}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Vazio />
                )}
              </div>
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Serviços</p>
                {ej.servicos.length ? (
                  <ul className="grid list-disc gap-1 pl-5 text-sm sm:grid-cols-2">
                    {ej.servicos.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <Vazio />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Canais institucionais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {canais.map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <c.icon className="size-4 text-muted-foreground" />
                  <LinkExterno href={c.href}>{c.texto}</LinkExterno>
                </div>
              ))}
              {ej.emailInstitucional && (
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" />
                  <a
                    href={`mailto:${ej.emailInstitucional}`}
                    className="text-primary hover:underline"
                  >
                    {ej.emailInstitucional}
                  </a>
                </div>
              )}
              {ej.telefoneInstitucional && (
                <div className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" />
                  {ej.telefoneInstitucional}
                </div>
              )}
              {!canais.length && !ej.emailInstitucional && !ej.telefoneInstitucional && <Vazio />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fonte dos dados</CardTitle>
              <CardDescription>
                Coletado em {dataHora.format(new Date(ej.coletadoEm))}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div>
                <p className="mb-1 text-muted-foreground">Fonte principal</p>
                <LinkExterno href={ej.fonteUrl}>{new URL(ej.fonteUrl).host}</LinkExterno>
              </div>
              {ej.fontes.filter((f) => f !== ej.fonteUrl).length > 0 && (
                <div>
                  <p className="mb-1 text-muted-foreground">Outras fontes</p>
                  <ul className="grid gap-1">
                    {ej.fontes
                      .filter((f) => f !== ej.fonteUrl)
                      .map((f) => (
                        <li key={f} className="break-all">
                          {/^https?:\/\/\S+$/.test(f) ? (
                            <LinkExterno href={f}>{f.replace(/^https?:\/\//, '')}</LinkExterno>
                          ) : (
                            f
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {ej.verificado
                  ? 'Dados verificados manualmente.'
                  : 'Dados ainda não verificados manualmente.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
