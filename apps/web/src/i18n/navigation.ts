import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Locale-aware replacements for Next's navigation APIs.
 *
 * These wrap `next/link` and `next/navigation` so that a bare `/book`
 * becomes `/bn/book` for a Bangla reader without any caller writing the
 * prefix. That is the entire point: a prefix written by hand is a prefix
 * somebody forgets, and forgetting it silently throws the reader back into
 * English mid-journey.
 *
 * Exported from one module so no component imports `next/link` directly. If
 * one does, it still works — and quietly drops the locale, which is exactly
 * the bug that is hard to see in review.
 */
export const {
  Link: LocaleLink,
  redirect,
  usePathname,
  useRouter,
} = createNavigation(routing);
