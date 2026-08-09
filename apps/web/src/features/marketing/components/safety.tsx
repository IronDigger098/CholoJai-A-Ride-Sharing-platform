import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

const MEASURES = [
  {
    title: 'Drivers are checked before they drive',
    detail:
      'Identity and vehicle documents are reviewed by a person, and a driver cannot accept a ride until that review passes.',
  },
  {
    title: 'Someone can follow your ride',
    detail:
      'Share a live link with a friend or family member. They see the route and the driver without needing the app.',
  },
  {
    title: 'Every trip is rated, both ways',
    detail:
      'Ratings feed the matching that decides who drives, and a pattern of complaints removes a driver from it.',
  },
] as const;

export function Safety(): ReactNode {
  return (
    <section
      id="safety"
      aria-labelledby="safety-heading"
      className="bg-surface-raised border-border scroll-mt-20 border-y"
    >
      <div className="mx-auto max-w-5xl px-6 py-14">
        <h2 id="safety-heading" className="text-3xl font-semibold">
          Trust is a feature, not an afterthought
        </h2>

        <p className="text-content-muted mt-4 max-w-2xl text-pretty">
          Most of a ride happens with a stranger, often after dark. These are
          the things we do about that.
        </p>

        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {MEASURES.map((measure) => (
            /* `bg-surface` on a raised band: the card has to step *away*
               from the section behind it, and this section already sits on
               the raised surface. Inverting here keeps the card legible
               instead of dissolving into its background. */
            <Card as="li" key={measure.title} className="bg-surface">
              <h3 className="font-semibold text-pretty">{measure.title}</h3>
              <p className="text-content-muted mt-2 text-sm text-pretty">
                {measure.detail}
              </p>
            </Card>
          ))}
        </ul>
      </div>
    </section>
  );
}
