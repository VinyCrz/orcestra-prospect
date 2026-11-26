export function PageHeader({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex gap-2">{acoes}</div>}
    </div>
  );
}
