import { Skeleton } from '@/components/ui/skeleton';

/** Aparece na hora ao trocar de página, enquanto a próxima carrega. */
export default function Carregando() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Carregando">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
