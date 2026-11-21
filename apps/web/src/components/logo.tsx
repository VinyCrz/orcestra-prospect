import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
        O
      </span>
      <span>
        Orce&apos;estra <span className="text-primary">Prospect</span>
      </span>
    </div>
  );
}
