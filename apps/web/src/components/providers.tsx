'use client';
import { useState } from 'react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => {
    const cliente: QueryClient = new QueryClient({
      // Toda ação que grava algo deixa TODOS os dados velhos: as telas abertas recarregam na hora e as
      // outras (dashboard, funil, carteira…) recarregam ao serem abertas. Assim nenhum número fica defasado.
      mutationCache: new MutationCache({ onSuccess: () => void cliente.invalidateQueries() }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          // voltar para a aba recarrega o que estiver velho (ex.: outra pessoa mexeu no funil)
          refetchOnWindowFocus: true,
          retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
        },
      },
    });
    return cliente;
  });
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={qc}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
