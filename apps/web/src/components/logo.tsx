import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Marca Orc'estra. A arte tem fundo verde próprio, então vai em bloco arredondado.
 * `completa`: logo larga (>= sm); em telas estreitas vira ícone + "Prospect".
 */
export function Logo({
  className,
  completa = false,
}: {
  className?: string;
  completa?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      {completa ? (
        <Image
          src="/brand/logo-orcestra.png"
          alt="Orc'estra Gamificação"
          width={378}
          height={159}
          priority
          className="h-12 w-auto rounded-lg bg-logo-bg shadow-sm"
        />
      ) : (
        <>
          <Image
            src="/brand/icone-orcestra.png"
            alt="Orc'estra Gamificação"
            width={49}
            height={56}
            priority
            className="h-8 w-auto rounded-md bg-logo-bg p-1 shadow-sm"
          />
          <span>
            Prospect
          </span>
        </>
      )}
    </div>
  );
}
