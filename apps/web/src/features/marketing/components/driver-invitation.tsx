import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

const REASONS = [
  {
    title: 'Earnings you can check',
    detail:
      'What you made today and this week, with the commission shown as a number rather than implied by a gap.',
  },
  {
    title: 'Accept in one tap',
    detail:
      'Requests show the pickup, the destination and the fare before you decide, so you decide once.',
  },
  {
    title: 'Onboarding that answers back',
    detail:
      'If an application is rejected you are told which document failed and can replace it, rather than starting again.',
  },
] as const;

export function DriverInvitation(): ReactNode {
  return (
    <section
      id="drive"
      aria-labelledby="drive-heading"
      className="mx-auto max-w-5xl scroll-mt-20 px-6 py-14"
    >
      <h2 id="drive-heading" className="text-3xl font-semibold">
        Drive with CholoJai
      </h2>

      <p className="text-content-muted mt-4 max-w-2xl text-pretty">
        Built with drivers in mind as much as riders — because a platform
        drivers resent is a platform riders cannot rely on.
      </p>

      <dl className="mt-8 grid gap-8 md:grid-cols-3">
        {REASONS.map((reason) => (
          <div key={reason.title}>
            <dt className="font-semibold text-pretty">{reason.title}</dt>
            <dd className="text-content-muted mt-2 text-sm text-pretty">
              {reason.detail}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-10">
        <Button variant="accent">Become a driver</Button>
      </div>
    </section>
  );
}
