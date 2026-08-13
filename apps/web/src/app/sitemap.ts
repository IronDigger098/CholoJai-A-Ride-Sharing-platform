import type { MetadataRoute } from 'next';

import { routing } from '@/i18n/routing';
import { siteUrl } from '@/lib/site';

/**
 * The sitemap.
 *
 * Only routes that exist and are worth crawling. A sitemap listing routes
 * that do not exist is worse than a short one: crawlers follow it, get
 * 404s, and lose confidence in the file. Everything behind a session is
 * absent for the same reason — a crawler reaching `/book` sees a sign-in
 * redirect, not a page.
 *
 * `lastModified` is deliberately absent. The correct value is when the
 * content last changed, and the only value available at build time is
 * "now" — which would tell crawlers the page changes on every deploy,
 * training them to ignore the field.
 *
 * Since M10b each page appears once, with its translations declared as
 * `alternates.languages` rather than as separate entries. That is what
 * hreflang is for: listing `/` and `/bn` as two unrelated URLs invites a
 * crawler to treat them as duplicate content competing with each other,
 * where declaring them as alternates says they are one page in two
 * languages and each should be shown to the readers of that language.
 */

/** Public routes. Anything behind a session is deliberately absent. */
const PAGES = [
  { path: '', changeFrequency: 'monthly', priority: 1 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
] as const satisfies readonly {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}[];

/**
 * Where a page lives in a given language.
 *
 * Mirrors `localePrefix: 'as-needed'` — English has no prefix, Bangla does.
 * If that setting ever changes, this is the one place that has to follow,
 * and a sitemap pointing at redirects is the symptom that would say so.
 */
function href(locale: string, path: string): string {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;

  return `${siteUrl()}${prefix}${path === '' ? '/' : path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({
    url: href(routing.defaultLocale, page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, href(locale, page.path)]),
      ),
    },
  }));
}
