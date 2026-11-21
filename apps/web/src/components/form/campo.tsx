import { Label } from '@/components/ui/label';

export function Campo({
  id,
  label,
  erro,
  children,
  extra,
}: {
  id: string;
  label: string;
  erro?: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {extra}
      </div>
      {children}
      {erro && (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
