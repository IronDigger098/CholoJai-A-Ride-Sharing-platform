import {
  estimateFare,
  type FareBreakdown as Breakdown,
  formatTaka,
  type Paisa,
  VehicleType,
} from '@cholojai/shared';
import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

/**
 * A worked example of a fare.
 *
 * Priced by the real engine — the same `estimateFare` the API uses to
 * quote a ride — rather than by numbers typed into this file. A marketing
 * page that advertises pricing the product does not implement is a
 * promise nobody is keeping, and hard-coding the figures is exactly how
 * that happens: the rates change, and the page does not.
 *
 * Amounts are rendered with decimals. `formatTaka` rounds to whole taka by
 * default, which would show a ৳8.80 line as ৳9 and a ৳184.80 total as
 * ৳185 — each correct on its own, and capable of producing a column that
 * visibly does not add up. On a section whose entire claim is that the
 * lines sum to the total, the displayed figures have to sum too.
 */

/* The route is priced, not described, so it holds no copy — the name a
   reader sees comes from the catalogue, because "Dhanmondi to Banani" is
   written differently in Bangla. */
const ROUTE = {
  vehicleType: VehicleType.CNG,
  distanceMetres: 8400,
  durationSeconds: 660,
} as const;

const FARE: Breakdown = estimateFare(ROUTE);

const EXACT = { withDecimals: true } as const;

/** Which line takes which amount. The words are in the catalogues. */
const LINES: readonly { key: string; amount: Paisa }[] = [
  { key: 'base', amount: FARE.base },
  { key: 'distance', amount: FARE.distance },
  { key: 'time', amount: FARE.time },
];

export function FareBreakdown(): ReactNode {
  const t = useTranslations('fares');

  return (
    <section
      id="fares"
      aria-labelledby="fares-heading"
      className="mx-auto max-w-5xl scroll-mt-20 px-6 py-14"
    >
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h2 id="fares-heading" className="text-3xl font-semibold">
            {t('heading')}
          </h2>

          <p className="text-content-muted mt-4 max-w-prose text-pretty">
            {t('body1')}
          </p>

          <p className="text-content-muted mt-4 max-w-prose text-pretty">
            {t('body2')}
          </p>
        </div>

        <Card as="article" aria-labelledby="example-fare-heading">
          <h3
            id="example-fare-heading"
            className="text-content-subtle text-xs font-semibold tracking-widest uppercase"
          >
            {t('example', { route: t('route') })}
          </h3>

          <dl className="mt-5 space-y-4">
            {LINES.map((line) => (
              <div
                key={line.key}
                className="flex items-baseline justify-between gap-4"
              >
                <dt>
                  <span className="font-medium">{t(`${line.key}Label`)}</span>
                  <span className="text-content-subtle block text-xs">
                    {t(`${line.key}Detail`)}
                  </span>
                </dt>
                <dd className="tabular-nums">
                  {formatTaka(line.amount, EXACT)}
                </dd>
              </div>
            ))}
          </dl>

          <div className="border-border mt-5 flex items-baseline justify-between border-t pt-5">
            <span className="font-semibold">{t('total')}</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatTaka(FARE.total, EXACT)}
            </span>
          </div>
        </Card>
      </div>
    </section>
  );
}
