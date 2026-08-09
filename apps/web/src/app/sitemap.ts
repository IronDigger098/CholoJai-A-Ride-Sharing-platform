import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/**
 * The sitemap.
 *
 * One entry, honestly. A sitemap listing routes that do not exist is worse
 * than a short one: crawlers follow it, get 404s, and lose confidence in
 * the file. Routes are added here as they ship.
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
  ];
}
