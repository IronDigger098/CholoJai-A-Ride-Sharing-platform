import { addPaisa, formatTaka, type Paisa, paisa } from '@cholojai/shared';

import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

/**
 * A worked example of a fare.
 *
 * The numbers are computed with the same money helpers the API uses, in
 * integer paisa, and totalled with `addPaisa` rather than written down.
 * That is not decoration: a marketing page whose example total does not
 * equal the sum of its own lines is the exact kind of small dishonesty
 * this product's first principle is against, and hard-coding the total is
 * how it happens.
 */

interface FareLine {
  readonly label: string;
  readonly detail: string;
  readonly amount: Paisa;
}

const LINES: readonly FareLine[] = [
  {
    label: 'Base fare',
    detail: 'Covers pickup and the first kilometre',
    amount: paisa(5000),
  },
  {
    label: 'Distance',
    detail: '8.4 km across the city',
    amount: paisa(12_800),
  },
  {
    label: 'Time',
    detail: '11 minutes, including two signals',
    amount: paisa(700),
  },
];

const TOTAL = addPaisa(...LINES.map((line) => line.amount));

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
            number — so a receipt&rsquo;s lines always add up to its total.
          </p>
        </div>

        <Card as="article" aria-labelledby="example-fare-heading">
          <h3
            id="example-fare-heading"
            className="text-content-subtle text-xs font-semibold tracking-widest uppercase"
          >
            Example — Dhanmondi to Banani
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
                <dd className="tabular-nums">{formatTaka(line.amount)}</dd>
              </div>
            ))}
          </dl>

          <div className="border-border mt-5 flex items-baseline justify-between border-t pt-5">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatTaka(TOTAL)}
            </span>
          </div>
        </Card>
      </div>
    </section>
  );
}
