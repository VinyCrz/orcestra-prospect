import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Marca: ícone do capacete Orc'estra (arte com fundo verde próprio, em bloco arredondado) + nome do sistema.
 * `completa`: versão maior (sidebar, telas de login); senão compacta (topo em telas estreitas).
 */
export function Logo({
  className,
  completa = false,
}: {
  className?: string;
  completa?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <Image
        src="/brand/icone-orcestra.png"
        alt="Orc'estra"
        width={49}
        height={56}
        priority
        className={cn(
          'w-auto rounded-md bg-logo-bg shadow-sm',
          completa ? 'h-11 p-1' : 'h-8 p-0.5',
        )}
      />
      <span className="whitespace-nowrap text-base leading-tight">
        Orc&apos;estra <span className="text-primary">Prospect</span>
      </span>
    </div>
  );
}
