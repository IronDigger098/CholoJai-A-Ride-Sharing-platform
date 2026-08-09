import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * The hero.
 *
 * The headline is the product spec's one-line pitch, near enough verbatim,
 * because that sentence was already the answer to "what is this". A
 * landing page that invents a different promise from the one the product
 * was specified against is how marketing and product drift apart.
 */

const PROMISES = [
  { title: 'Upfront fares', detail: 'One price, shown before you book.' },
  { title: 'Verified drivers', detail: 'Identity and vehicle checked.' },
  { title: 'Live tracking', detail: 'Share your journey as it happens.' },
] as const;

export function Hero(): ReactNode {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-16 pb-14 sm:pt-24">
      <p className="text-accent text-sm font-medium tracking-widest uppercase">
        চলো যাই — let&rsquo;s go
      </p>

      <h1 className="mt-4 max-w-3xl text-4xl font-semibold text-balance sm:text-5xl">
        Book a verified ride with an upfront fare in under 30 seconds.
      </h1>

      <p className="text-content-muted mt-6 max-w-2xl text-lg text-pretty">
        No haggling at the kerb and no surprises at the end. See the price
        before you book, know who is picking you up, and let someone follow your
        journey while you take it.
      </p>

      <div className="mt-9 flex flex-wrap gap-3">
        <Button>Book a ride</Button>
        <Button variant="ghost">See how it works</Button>
      </div>

      <dl className="mt-14 grid gap-6 sm:grid-cols-3">
        {PROMISES.map((promise) => (
          <div key={promise.title}>
            {/* A description list, not three divs. The pairing of a claim
                and its explanation is exactly what dl/dt/dd describes, and
                it is what a screen reader will announce. */}
            <dt className="font-semibold">{promise.title}</dt>
            <dd className="text-content-muted mt-1 text-sm">
              {promise.detail}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
