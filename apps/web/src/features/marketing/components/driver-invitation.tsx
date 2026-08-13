import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/** Reason order, as message-key stems. The words are in the catalogues. */
const REASONS = ['earnings', 'accept', 'onboarding'] as const;

export function DriverInvitation(): ReactNode {
  const t = useTranslations('drive');

  return (
    <section
      id="drive"
      aria-labelledby="drive-heading"
      className="mx-auto max-w-5xl scroll-mt-20 px-6 py-14"
    >
      <h2 id="drive-heading" className="text-3xl font-semibold">
        {t('heading')}
      </h2>

      <p className="text-content-muted mt-4 max-w-2xl text-pretty">
        {t('intro')}
      </p>

      <dl className="mt-8 grid gap-8 md:grid-cols-3">
        {REASONS.map((reason) => (
          <div key={reason}>
            <dt className="font-semibold text-pretty">{t(`${reason}Title`)}</dt>
            <dd className="text-content-muted mt-2 text-sm text-pretty">
              {t(`${reason}Detail`)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-10">
        <Button variant="accent">{t('cta')}</Button>
      </div>
    </section>
  );
}
