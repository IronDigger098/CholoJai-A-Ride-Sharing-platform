import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';

const REPOSITORY =
  'https://github.com/IronDigger098/CholoJai-A-Ride-Sharing-platform';

export function SiteFooter(): ReactNode {
  const t = useTranslations('site');

  return (
    <footer className="border-border border-t">
      <div className="text-content-muted mx-auto max-w-5xl px-6 py-10 text-sm">
        <p className="text-content font-semibold">
          CholoJai{' '}
          <span className="text-accent font-medium">{t('tagline')}</span>
        </p>

        <p className="mt-3 max-w-prose text-pretty">{t('footer.about')}</p>

        <p className="mt-6">
          <Link href={REPOSITORY} external className="font-medium">
            {t('footer.source')}
          </Link>
        </p>

        {/* A fixed year rather than `new Date()`. This page is statically
            rendered, so a computed year freezes at build time and then
            quietly goes stale — worse than a number that is honestly
            constant. It lives in the catalogue because Bangla writes it in
            Bengali digits, which is a translation and not arithmetic. */}
        <p className="text-content-subtle mt-6 text-xs">
          {t('footer.disclaimer')}
        </p>
      </div>
    </footer>
  );
}
