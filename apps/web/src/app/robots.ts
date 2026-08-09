import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/**
 * `robots.txt`.
 *
 * `/api/` is disallowed not as a security measure — robots.txt is a
 * request, not a control, and anything genuinely private must be protected
 * on the server — but because API responses are not pages, and having them
 * in an index wastes crawl budget and surfaces JSON in search results.
 *
 * Note that pages are *allowed* here even though indexing is governed by
 * the `robots` metadata in the root layout. That is the correct pairing:
 * a crawler blocked in robots.txt never fetches the page, so it never sees
 * a meta directive at all. Disallowing a URL you want de-indexed is the
 * classic way to keep it in the index forever.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
