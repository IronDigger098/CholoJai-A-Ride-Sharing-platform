'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useId, useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale, LOCALE_LABEL, routing } from '@/i18n/routing';

/**
 * Switch between English and Bangla.
 *
 * A `<select>` rather than a pair of buttons or a flag. Flags are the
 * standard mistake — a language is not a country, and Bangla is read in two
 * of them — and buttons stop scaling the moment a third language exists.
 *
 * The switch replaces the current path rather than navigating home. Someone
 * on `/rides/abc123` who changes language wants that ride in Bangla, not the
 * landing page; `usePathname` from `@/i18n/navigation` returns the path with
 * the locale prefix already stripped, so the router can re-apply the new one
 * without any string surgery here.
 */
export function LocaleSwitcher(): ReactNode {
  const id = useId();
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {/* Labelled, not placeholder-only. A select whose purpose is carried
          by its selected value alone announces as "English, combo box" to a
          screen reader, which does not say what changing it would do. */}
      <label htmlFor={id} className="sr-only">
        {t('language')}
      </label>

      <select
        id={id}
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as Locale;

          /* In a transition, so the current page stays interactive while
             the new one streams in rather than blanking to a fallback. */
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
        className="border-border-strong bg-surface text-content h-9 rounded-md border px-2 text-sm"
      >
        {routing.locales.map((option) => (
          <option key={option} value={option}>
            {LOCALE_LABEL[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
