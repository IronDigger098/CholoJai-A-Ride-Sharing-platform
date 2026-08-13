import { useTranslations } from 'next-intl';

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

/**
 * The three claims, as message-key stems.
 *
 * Keys rather than the strings themselves, because the strings now live in
 * the catalogues. Keeping the array is what preserves the order and the
 * `dl` markup below; only the source of the words changed.
 */
const PROMISES = ['fare', 'drivers', 'tracking'] as const;

export function Hero(): ReactNode {
  const t = useTranslations('hero');

  return (
    <section className="mx-auto max-w-5xl px-6 pt-16 pb-14 sm:pt-24">
      <p className="text-accent text-sm font-medium tracking-widest uppercase">
        {t('eyebrow')}
      </p>

      <h1 className="mt-4 max-w-3xl text-4xl font-semibold text-balance sm:text-5xl">
        {t('headline')}
      </h1>

      <p className="text-content-muted mt-6 max-w-2xl text-lg text-pretty">
        {t('body')}
      </p>

      <div className="mt-9 flex flex-wrap gap-3">
        <Button>{t('book')}</Button>
        <Button variant="ghost">{t('learn')}</Button>
      </div>

      <dl className="mt-14 grid gap-6 sm:grid-cols-3">
        {PROMISES.map((promise) => (
          <div key={promise}>
            {/* A description list, not three divs. The pairing of a claim
                and its explanation is exactly what dl/dt/dd describes, and
                it is what a screen reader will announce. */}
            <dt className="font-semibold">{t(`promises.${promise}Title`)}</dt>
            <dd className="text-content-muted mt-1 text-sm">
              {t(`promises.${promise}Detail`)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
