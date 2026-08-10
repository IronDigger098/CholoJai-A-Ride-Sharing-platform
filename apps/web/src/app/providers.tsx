'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { createQueryClient } from '@/lib/query-client';

/**
 * Client-side providers for the whole app.
 *
 * The smallest possible client boundary: the root layout stays a Server
 * Component, and only this wrapper and its children ship as client code.
 *
 * The client is created inside `useState` rather than at module scope. A
 * module-level instance is created once per *process*, which on the server
 * means one cache shared by every user rendering at the same time — one
 * person's ride history served to another. `useState` gives each render tree
 * its own, and the initialiser form means it is constructed once per mount
 * rather than on every re-render.
 */
export function Providers({ children }: { children: ReactNode }): ReactNode {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
