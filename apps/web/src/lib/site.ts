/**
 * Facts about this deployment that more than one file needs.
 *
 * The site URL is read from the environment rather than hard-coded,
 * because canonical URLs, `sitemap.xml`, `robots.txt`, and Open Graph tags
 * must all agree with each other *and* with wherever this is actually
 * deployed. Hard-coding it means a preview deployment advertises the
 * production URL as canonical and asks search engines to index the wrong
 * host.
 */

const FALLBACK_URL = 'http://localhost:3000';

/**
 * `NEXT_PUBLIC_SITE_URL`, normalised.
 *
 * Trailing slashes are stripped so `${siteUrl()}/about` cannot produce a
 * double slash — a different URL to a crawler, and a duplicate-content
 * problem for something nobody would ever notice by eye.
 */
export function siteUrl(): string {
  const configured = process.env['NEXT_PUBLIC_SITE_URL'];
  const value =
    configured === undefined || configured.trim() === ''
      ? FALLBACK_URL
      : configured.trim();

  return value.replace(/\/+$/u, '');
}

export const SITE_NAME = 'CholoJai';

export const SITE_DESCRIPTION =
  'Book a verified ride with an upfront fare in under 30 seconds. ' +
  'Transparent pricing, checked drivers, and live tracking across Bangladesh.';
