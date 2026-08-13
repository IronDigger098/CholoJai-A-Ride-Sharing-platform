import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

/**
 * Resolve the locale and load its messages, once per request.
 *
 * `hasLocale` rather than a cast. The segment arrives from the URL, so it is
 * whatever a stranger typed — `/xx/book` reaches here with `'xx'`, and a
 * cast would turn that into a failed dynamic import and a 500 on a route
 * that should simply be English.
 *
 * The whole catalogue is loaded, not a subset. Splitting messages per route
 * is the standard next-intl optimisation and it is premature here: both
 * files are a few kilobytes, and the machinery to keep namespaces and routes
 * in step is more code than it saves. When a catalogue is large enough for
 * this to matter, `getMessages` accepts a narrower object and nothing else
 * changes.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (
      (await import(`../../messages/${locale}.json`)) as {
        default: Record<string, unknown>;
      }
    ).default,

    /* Dhaka, explicitly. Left unset, dates format against the *server's*
       zone — which is UTC in a container and the developer's zone locally,
       so a ride at 1 a.m. Dhaka time renders as the previous evening in
       production and correctly on the machine where it was written. */
    timeZone: 'Asia/Dhaka',
  };
});
