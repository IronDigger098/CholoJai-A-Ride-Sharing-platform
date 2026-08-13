import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

/** Step order, as message-key stems. The words are in the catalogues. */
const STEPS = ['where', 'fare', 'track'] as const;

export function HowItWorks(): ReactNode {
  const t = useTranslations('howItWorks');

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto max-w-5xl scroll-mt-20 px-6 py-14"
    >
      <h2 id="how-it-works-heading" className="text-3xl font-semibold">
        {t('heading')}
      </h2>

      {/* An ordered list because the order is the meaning. A screen reader
          announces "list, 3 items" and the position of each, which is
          information a grid of divs simply does not carry. */}
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Card as="li" key={step}>
            <span
              aria-hidden="true"
              className="bg-accent text-accent-content flex size-8 items-center justify-center rounded-full text-sm font-semibold"
            >
              {index + 1}
            </span>

            <h3 className="mt-4 font-semibold">{t(`${step}Title`)}</h3>
            <p className="text-content-muted mt-2 text-sm text-pretty">
              {t(`${step}Detail`)}
            </p>
          </Card>
        ))}
      </ol>
    </section>
  );
}
