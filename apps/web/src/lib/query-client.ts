import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api-error';

/**
 * Query defaults, chosen against this API rather than accepted as they come.
 */

/** Roughly the access-token lifetime, so a screen re-reads about as often. */
const STALE_TIME_MS = 30_000;

const MAX_RETRIES = 2;

/**
 * Retry only failures a retry can fix.
 *
 * React Query's default retries three times on everything, which is wrong
 * for a JSON API and quietly harmful here. A 422 on an expired quote will
 * never succeed, and retrying it triples the delay before the rider is told
 * to re-quote. A 409 on a ride someone else already accepted is the same. A
 * 401 is already handled by the client's refresh interceptor, so a retry at
 * this layer would only fire after that failed.
 *
 * 5xx and network failures are worth retrying: the request was fine and the
 * next attempt may land differently.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiError)) return false;

  /* status 0 is the "never reached the server" case from toApiError. */
  return error.status === 0 || error.status >= 500;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: shouldRetry,
        /* Refetching whenever the tab regains focus is right for a live
           board and wrong for a form: a rider mid-booking who checks another
           tab should not come back to a re-rendered page. Screens that want
           it opt in. */
        refetchOnWindowFocus: false,
      },
      mutations: {
        /* Never automatically. A retried POST /rides books a second ride,
           and the one-active-ride index turns that into a 409 the rider did
           not cause. Mutations retry when a person presses the button. */
        retry: false,
      },
    },
  });
}
