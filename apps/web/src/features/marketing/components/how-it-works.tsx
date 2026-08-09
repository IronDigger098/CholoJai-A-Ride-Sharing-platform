import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

const STEPS = [
  {
    title: 'Tell us where',
    detail:
      'Pickup and destination, typed or dropped on the map. Saved places for the trips you make every day.',
  },
  {
    title: 'See the fare first',
    detail:
      'One number, worked out from distance, time and vehicle type — with the breakdown shown, not hidden behind a total.',
  },
  {
    title: 'Track every minute',
    detail:
      'Watch your driver approach, see their name and vehicle before they arrive, and share the ride with someone at home.',
  },
] as const;

export function HowItWorks(): ReactNode {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto max-w-5xl scroll-mt-20 px-6 py-14"
    >
      <h2 id="how-it-works-heading" className="text-3xl font-semibold">
        Three steps, no phone calls
      </h2>

      {/* An ordered list because the order is the meaning. A screen reader
          announces "list, 3 items" and the position of each, which is
          information a grid of divs simply does not carry. */}
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Card as="li" key={step.title}>
            <span
              aria-hidden="true"
              className="bg-accent text-accent-content flex size-8 items-center justify-center rounded-full text-sm font-semibold"
            >
              {index + 1}
            </span>

            <h3 className="mt-4 font-semibold">{step.title}</h3>
            <p className="text-content-muted mt-2 text-sm text-pretty">
              {step.detail}
            </p>
          </Card>
        ))}
      </ol>
    </section>
  );
}
