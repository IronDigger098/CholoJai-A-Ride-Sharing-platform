'use client';

import {
  formatTaka,
  type Paisa,
  type RideListQuery,
  RideStatus,
} from '@cholojai/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';

import { listRides } from '../api';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Link } from '@/components/ui/link';
import { toApiError } from '@/lib/api-error';

/** Matches the server's default; stated here so the request is explicit. */
const PAGE_SIZE = 20;

const EXACT = { withDecimals: true } as const;

/**
 * Past and current rides, newest first.
 *
 * `useInfiniteQuery` rather than pages with numbers, because the API is
 * cursor-paginated and cursors have no random access by design (api-design
 * §3). Asking for "page 4" is not a question this endpoint can answer, and a
 * UI that offers it would be promising something the backend deliberately
 * does not do.
 */
export function RideHistory(): ReactNode {
  const t = useTranslations('rides');
  const status = useTranslations('rideStatus');
  const vehicle = useTranslations('vehicle');
  const format = useFormatter();
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery({
    queryKey: ['rides'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listRides({
        limit: PAGE_SIZE,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      } satisfies RideListQuery),
    initialPageParam: undefined as string | undefined,
    /* Null means the server has no more, so returning undefined is what
       switches `hasNextPage` off. Returning null instead would leave the
       button visible and fetching the same page forever. */
    getNextPageParam: (last) => last.pageInfo.nextCursor ?? undefined,
  });

  if (isPending) {
    return (
      <p role="status" className="text-content-muted text-sm">
        {t('loading')}
      </p>
    );
  }

  if (error !== null) {
    return (
      <p role="alert" className="text-danger text-sm">
        {toApiError(error).message}
      </p>
    );
  }

  const rides = data.pages.flatMap((page) => page.data);

  if (rides.length === 0) {
    return (
      <p className="text-content-muted text-sm">
        {t.rich('empty', {
          link: (chunks) => <Link href="/book">{chunks}</Link>,
        })}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {rides.map((ride) => (
          <li key={ride.id}>
            <Link
              href={`/rides/${ride.id}`}
              className="border-border-strong hover:bg-surface-raised block rounded-md border px-4 py-3 no-underline"
            >
              <span className="flex items-baseline justify-between gap-4">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {ride.dropoffAddress}
                  </span>
                  <span className="text-content-subtle block text-xs">
                    {format.dateTime(new Date(ride.requestedAt), {
                      dateStyle: 'medium',
                    })}{' '}
                    ·{' '}
                    {ride.status === RideStatus.COMPLETED
                      ? vehicle(ride.vehicleType)
                      : status(ride.status)}
                  </span>
                </span>

                <span className="text-sm font-semibold tabular-nums">
                  {formatTaka(ride.fare.total as Paisa, EXACT)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => {
            void fetchNextPage();
          }}
          disabled={isFetchingNextPage}
          className="w-full"
        >
          {isFetchingNextPage ? t('loading') : t('older')}
        </Button>
      )}
    </div>
  );
}
