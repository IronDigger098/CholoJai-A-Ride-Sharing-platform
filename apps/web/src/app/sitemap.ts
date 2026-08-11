import type { MetadataRoute } from 'next';

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
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl()}/`,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${siteUrl()}/contact`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];
}
