import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../messages/en.json';

import type { ReactElement, ReactNode } from 'react';

import { routing } from '@/i18n/routing';

/**
 * Render a component inside the providers it expects.
 *
 * Retries are off and there is no cache lifetime, deliberately. The
 * production defaults retry 5xx twice, which in a test turns one deliberate
 * failure into three requests and a passing assertion three seconds late —
 * and a shared cache between tests makes them order-dependent.
 *
 * A fresh `QueryClient` per call is what keeps them isolated.
 *
 * The real English catalogue is loaded rather than a fixture. Specs then
 * assert on the words a user actually reads, and a message deleted from
 * `en.json` fails the test that depended on it instead of silently becoming
 * a rendered key. The trade is that rewording a string breaks its spec —
 * which is the correct amount of friction for changing what the product
 * says.
 */
export function renderWithProviders(
  ui: ReactElement,
  locale: string = routing.defaultLocale,
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      /* The time zone is pinned to match `request.ts`. Left out, next-intl
         falls back to the machine's zone, and a date assertion would pass
         in Dhaka and fail in CI. */
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="Asia/Dhaka"
      >
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
