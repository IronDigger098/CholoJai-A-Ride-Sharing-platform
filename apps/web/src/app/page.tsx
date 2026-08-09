import { formatTaka, takaToPaisa } from '@cholojai/shared';

import type { ReactNode } from 'react';

/**
 * A placeholder, and deliberately not a design.
 *
 * M4.1 is the scaffold: this page exists to prove three things are wired
 * together before any visual work makes them expensive to change — that
 * Tailwind's utilities reach the browser, that the shared contracts package
 * resolves and its built types are visible to the compiler, and that the
 * whole thing survives `next build`. The real landing page arrives in M4.4,
 * built out of the tokens and primitives that come first.
 *
 * `formatTaka` is here rather than a hard-coded string on purpose: it is the
 * cheapest possible end-to-end check that `apps/web` is genuinely consuming
 * `packages/shared`'s emitted output, which is exactly the dependency that
 * broke silently four times while building the API.
 */
export default function HomePage(): ReactNode {
  const sampleFare = formatTaka(takaToPaisa(185));

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="text-sm font-medium tracking-widest text-teal-700 uppercase">
        চলো যাই
      </p>

      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        CholoJai
      </h1>

      <p className="text-lg text-neutral-600">
        Upfront fares, verified drivers, and live tracking for everyday
        journeys. A typical airport run costs about {sampleFare}.
      </p>

      <p className="text-sm text-neutral-500">
        Scaffold only — the design system arrives in M4.2.
      </p>
    </main>
  );
}
