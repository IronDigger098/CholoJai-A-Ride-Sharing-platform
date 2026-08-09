import type { ReactNode } from 'react';

import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site';

/**
 * JSON-LD describing the site to search engines.
 *
 * Structured data is what lets a result show as something other than a
 * blue link — a name, a logo, a knowledge panel. Two objects rather than
 * one: `Organization` describes who publishes this, `WebSite` describes
 * the thing being published, and search engines treat them as separate
 * entities that happen to be related.
 *
 * `dangerouslySetInnerHTML` is required — React escapes text children, and
 * escaped JSON inside a `application/ld+json` block is not valid JSON. The
 * content is built from constants in this repository and interpolates
 * nothing from a user, so there is no injection surface; `JSON.stringify`
 * also escapes any `<` that appeared in a value.
 */
export function StructuredData(): ReactNode {
  const url = siteUrl();

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${url}/#organization`,
        name: SITE_NAME,
        url,
        description: SITE_DESCRIPTION,
        areaServed: { '@type': 'Country', name: 'Bangladesh' },
      },
      {
        '@type': 'WebSite',
        '@id': `${url}/#website`,
        name: SITE_NAME,
        url,
        description: SITE_DESCRIPTION,
        publisher: { '@id': `${url}/#organization` },
        inLanguage: 'en',
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
