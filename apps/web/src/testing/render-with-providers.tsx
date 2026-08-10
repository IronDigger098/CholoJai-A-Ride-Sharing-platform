import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';

import type { ReactElement, ReactNode } from 'react';

/**
 * Render a component inside the providers it expects.
 *
 * Retries are off and there is no cache lifetime, deliberately. The
 * production defaults retry 5xx twice, which in a test turns one deliberate
 * failure into three requests and a passing assertion three seconds late —
 * and a shared cache between tests makes them order-dependent.
 *
 * A fresh `QueryClient` per call is what keeps them isolated.
 */
export function renderWithProviders(ui: ReactElement): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
