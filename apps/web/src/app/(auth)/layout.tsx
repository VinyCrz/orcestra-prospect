import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-svh lg:grid-cols-2">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-col p-6 md:p-10">
        <Logo completa />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 to-brand-900 lg:flex lg:flex-col lg:justify-end lg:p-12">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-brand-cream/10 blur-2xl" />
        <div className="absolute bottom-40 -left-16 size-72 rounded-full bg-brand-accent/25 blur-3xl" />
        <div className="relative text-brand-cream">
          <p className="text-3xl leading-tight font-semibold">
            Prospecção de Empresas Juniores, do mapa ao primeiro contato.
          </p>
          <p className="mt-3 text-brand-cream/80">
            Base pública e auditável de EJs do Movimento Empresa Júnior em todo o Brasil.
          </p>
        </div>
      </div>
    </div>
  );
}
