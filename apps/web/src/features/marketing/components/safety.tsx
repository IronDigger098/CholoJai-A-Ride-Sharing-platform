import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

/** Measure order, as message-key stems. The words are in the catalogues. */
const MEASURES = ['checks', 'share', 'ratings'] as const;

export function Safety(): ReactNode {
  const t = useTranslations('safety');

  return (
    <section
      id="safety"
      aria-labelledby="safety-heading"
      className="bg-surface-raised border-border scroll-mt-20 border-y"
    >
      <div className="mx-auto max-w-5xl px-6 py-14">
        <h2 id="safety-heading" className="text-3xl font-semibold">
          {t('heading')}
        </h2>

        <p className="text-content-muted mt-4 max-w-2xl text-pretty">
          {t('intro')}
        </p>

        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {MEASURES.map((measure) => (
            /* `bg-surface` on a raised band: the card has to step *away*
               from the section behind it, and this section already sits on
               the raised surface. Inverting here keeps the card legible
               instead of dissolving into its background. */
            <Card as="li" key={measure} className="bg-surface">
              <h3 className="font-semibold text-pretty">
                {t(`${measure}Title`)}
              </h3>
              <p className="text-content-muted mt-2 text-sm text-pretty">
                {t(`${measure}Detail`)}
              </p>
            </Card>
          ))}
        </ul>
      </div>
    </section>
  );
}
