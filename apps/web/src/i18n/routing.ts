import { defineRouting } from 'next-intl/routing';

/**
 * Which languages exist, and how they appear in a URL.
 *
 * English and Bangla, with the locale in the path (`/`, `/bn/book`) rather
 * than in a cookie alone. A cookie-only scheme would serve two different
 * languages from one address, which breaks three things at once: a shared
 * link shows the sender's language rather than the reader's, a CDN caches
 * whichever version arrived first and serves it to everybody, and a crawler
 * indexes one language while the other is invisible. For a product whose
 * users read Bangla and whose marketing pages are meant to be found, none of
 * those is acceptable.
 *
 * `localePrefix: 'as-needed'` keeps English at the bare path and prefixes
 * only Bangla. Every existing URL therefore still resolves — the links
 * already shared, the sitemap already crawled — and adding a language costs
 * nobody a redirect.
 */
export const routing = defineRouting({
  locales: ['en', 'bn'],

  /* English, not Bangla, despite the audience. The API's error messages,
     the seeded data and the help articles are English today, so a Bangla
     default would produce a screen that is half-translated by accident.
     Bangla is one click away and remembered; when the content behind it is
     complete this line is the only thing that changes. */
  defaultLocale: 'en',

  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];

/**
 * What each language calls itself.
 *
 * Endonyms — "বাংলা", not "Bengali". Someone looking for their own language
 * in a list is looking for the word they would use for it, and a list that
 * names every language in English is only usable by people who already read
 * English.
 */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  bn: 'বাংলা',
};
