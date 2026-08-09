import {
  estimateFare,
  type FareBreakdown as Breakdown,
  formatTaka,
  type Paisa,
  VehicleType,
} from '@cholojai/shared';

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

const ROUTE = {
  label: 'Dhanmondi to Banani',
  vehicleType: VehicleType.CNG,
  distanceMetres: 8400,
  durationSeconds: 660,
} as const;

const FARE: Breakdown = estimateFare(ROUTE);

const EXACT = { withDecimals: true } as const;

const LINES: readonly { label: string; detail: string; amount: Paisa }[] = [
  {
    label: 'Base fare',
    detail: 'Covers pickup and the first kilometre',
    amount: FARE.base,
  },
  {
    label: 'Distance',
    detail: '8.4 km across the city',
    amount: FARE.distance,
  },
  {
    label: 'Time',
    detail: '11 minutes, including two signals',
    amount: FARE.time,
  },
];

export function FareBreakdown(): ReactNode {
  return (
    <section
      id="fares"
      aria-labelledby="fares-heading"
      className="mx-auto max-w-5xl scroll-mt-20 px-6 py-14"
    >
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h2 id="fares-heading" className="text-3xl font-semibold">
            The price you are shown is the price you pay
          </h2>

          <p className="text-content-muted mt-4 max-w-prose text-pretty">
            Fares are worked out from distance, time and vehicle type before you
            book, and they do not move while you ride. If traffic turns a
            twenty-minute trip into forty, that is our problem, not a surcharge
            on your receipt.
          </p>

          <p className="text-content-muted mt-4 max-w-prose text-pretty">
            Money is handled in whole paisa end to end — never a floating point
            number — so a receipt&rsquo;s lines always add up to its total. The
            figures beside this paragraph are not illustrations: they come from
            the same pricing engine that quotes a real ride.
          </p>
        </div>

        <Card as="article" aria-labelledby="example-fare-heading">
          <h3
            id="example-fare-heading"
            className="text-content-subtle text-xs font-semibold tracking-widest uppercase"
          >
            Example — {ROUTE.label}
          </h3>

          <dl className="mt-5 space-y-4">
            {LINES.map((line) => (
              <div
                key={line.label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt>
                  <span className="font-medium">{line.label}</span>
                  <span className="text-content-subtle block text-xs">
                    {line.detail}
                  </span>
                </dt>
                <dd className="tabular-nums">
                  {formatTaka(line.amount, EXACT)}
                </dd>
              </div>
            ))}
          </dl>

          <div className="border-border mt-5 flex items-baseline justify-between border-t pt-5">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatTaka(FARE.total, EXACT)}
            </span>
          </div>
        </Card>
      </div>
    </section>
  );
}
