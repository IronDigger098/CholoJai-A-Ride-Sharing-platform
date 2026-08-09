import { formatTaka, takaToPaisa } from '@cholojai/shared';

import type { ReactNode } from 'react';

/**
 * A placeholder, and deliberately not a design.
 *
 * Its job is to exercise the token layer end to end: every colour here is
 * a semantic token, so the page proves the system rather than merely
 * coexisting with it. Switch the operating system between light and dark
 * and nothing in this file changes — that is the whole argument for
 * naming roles instead of colours.
 *
 * The elements are plain markup with utility classes. No Button or Card
 * component exists yet, and inventing one to render a single instance
 * would be the abstraction-without-a-caller that `contributing.md`
 * forbids. Primitives arrive in M4.3, extracted from real usage.
 *
 * `formatTaka` stays from M4.1: the cheapest end-to-end check that the web
 * app is consuming `packages/shared`'s built output.
 */
export default function HomePage(): ReactNode {
  const sampleFare = formatTaka(takaToPaisa(185));

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-6 py-16">
      <div className="border-border bg-surface-raised w-full rounded-xl border p-8 sm:p-10">
        <p className="text-accent text-sm font-medium tracking-widest uppercase">
          চলো যাই
        </p>

        <h1 className="mt-3 text-4xl font-semibold text-balance">CholoJai</h1>

        <p className="text-content-muted mt-4 text-lg text-pretty">
          Upfront fares, verified drivers, and live tracking for everyday
          journeys. A typical airport run costs about {sampleFare}.
        </p>

        <button
          type="button"
          className="bg-action text-action-content hover:bg-action-hover mt-8 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors"
        >
          Book a ride
        </button>

        <p className="text-content-subtle border-border mt-8 border-t pt-6 text-sm">
          Scaffold only — the component library arrives in M4.3. This page
          follows your system colour scheme.
        </p>
      </div>
    </main>
  );
}
