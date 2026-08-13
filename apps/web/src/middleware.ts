import createMiddleware from 'next-intl/middleware';

import { routing } from '@/i18n/routing';

/**
 * Decide which language a request is in, before anything renders.
 *
 * The middleware reads the path first, then the `NEXT_LOCALE` cookie it
 * sets when somebody switches, then `Accept-Language`. Order matters: an
 * explicit choice must beat a browser header, or a Bangla reader on an
 * English-configured phone would be dragged back to English on every
 * navigation no matter how many times they switched.
 */
export default createMiddleware(routing);

export const config = {
  /*
   * Everything except the things that are not pages.
   *
   * `api` is excluded because those are the app's own route handlers and a
   * locale prefix on a fetch would 404. `_next` and `_vercel` are framework
   * internals. The final alternative excludes anything containing a dot —
   * `favicon.ico`, `opengraph-image.png`, `robots.txt` — because a static
   * file rewritten to `/bn/favicon.ico` is a file that does not exist.
   *
   * Written as a match-everything-minus-exceptions pattern rather than a
   * list of routes on purpose: a page added next year is covered by
   * existing, not by somebody remembering to add it here.
   */
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
