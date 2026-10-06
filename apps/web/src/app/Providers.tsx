import { useState, type ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Tooltip } from 'radix-ui';
import { createQueryClient } from '../api/queries';
import { ToastProvider } from '../components/ui/Toast';

/** All app-wide providers. Must be rendered inside a router. */
export function Providers({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={500}>
        <ToastProvider>{children}</ToastProvider>
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
