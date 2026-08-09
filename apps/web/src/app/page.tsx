import { formatTaka, takaToPaisa } from '@cholojai/shared';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * A placeholder, and deliberately not a design.
 *
 * Its job is to exercise the system end to end. Every colour is a semantic
 * token and every control is a primitive, so the page proves the layers
 * rather than merely sitting on top of them. There is not one `dark:`
 * class in this file, and it renders correctly in both schemes.
 *
 * `formatTaka` stays from M4.1: the cheapest end-to-end check that the web
 * app is consuming `packages/shared`'s built output.
 */
export default function HomePage(): ReactNode {
  const sampleFare = formatTaka(takaToPaisa(185));

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-6 py-16">
      <div className="border-border bg-surface-raised w-full rounded-xl border p-8 sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <p className="text-accent text-sm font-medium tracking-widest uppercase">
            চলো যাই
          </p>

          <ThemeToggle />
        </div>

        <h1 className="mt-3 text-4xl font-semibold text-balance">CholoJai</h1>

        <p className="text-content-muted mt-4 text-lg text-pretty">
          Upfront fares, verified drivers, and live tracking for everyday
          journeys. A typical airport run costs about {sampleFare}.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button>Book a ride</Button>
          <Button variant="accent">Become a driver</Button>
          {/* Disabled deliberately: it is the state most easily got wrong,
              and having it on screen keeps it honest. */}
          <Button variant="ghost" disabled>
            Track a ride
          </Button>
        </div>

        <p className="text-content-subtle border-border mt-8 border-t pt-6 text-sm">
          Scaffold only — the landing page arrives in M4.4. The theme control
          above cycles between your system setting and an explicit choice.
        </p>
      </div>
    </main>
  );
}
