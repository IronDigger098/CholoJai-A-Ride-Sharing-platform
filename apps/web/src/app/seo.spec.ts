import { afterEach, describe, expect, it } from '@jest/globals';

import robots from './robots';
import sitemap from './sitemap';

import { siteUrl } from '@/lib/site';

const ORIGINAL = process.env['NEXT_PUBLIC_SITE_URL'];

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env['NEXT_PUBLIC_SITE_URL'];
    return;
  }

  process.env['NEXT_PUBLIC_SITE_URL'] = ORIGINAL;
});

describe('siteUrl', () => {
  it('strips trailing slashes', () => {
    /* `${siteUrl()}/sitemap.xml` with a trailing slash produces a double
       slash, which is a different URL to a crawler and a duplicate-content
       problem nobody would ever spot by eye. */
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://cholojai.app///';

    expect(siteUrl()).toBe('https://cholojai.app');
  });

  it('falls back to localhost when unset', () => {
    delete process.env['NEXT_PUBLIC_SITE_URL'];

    expect(siteUrl()).toBe('http://localhost:3000');
  });

  it('treats an empty value as unset', () => {
    // A variable declared and left blank in CI is a normal accident, and
    // an empty metadataBase throws rather than degrading.
    process.env['NEXT_PUBLIC_SITE_URL'] = '   ';

    expect(siteUrl()).toBe('http://localhost:3000');
  });
});

describe('sitemap', () => {
  it('lists only routes that exist', () => {
    /* A sitemap advertising routes that 404 is worse than a short one:
       crawlers follow it, fail, and trust the file less. This will need
       updating as routes ship — which is the point. */
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://cholojai.app';

    expect(sitemap().map((entry) => entry.url)).toEqual([
      'https://cholojai.app/',
      'https://cholojai.app/contact',
    ]);
  });

  it('omits everything behind a session', () => {
    /* A crawler reaching `/book` or `/admin` sees a sign-in redirect, not a
       page. Listing them would spend crawl budget on nothing and advertise
       the shape of the admin surface to anyone reading the file. */
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://cholojai.app';

    const urls = sitemap().map((entry) => entry.url);

    for (const gated of ['/book', '/rides', '/drive', '/admin', '/login']) {
      expect(urls).not.toContain(`https://cholojai.app${gated}`);
    }
  });
});

describe('robots', () => {
  it('points at the sitemap on the configured host', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://cholojai.app';

    expect(robots().sitemap).toBe('https://cholojai.app/sitemap.xml');
  });

  it('allows crawling pages while excluding the API', () => {
    /* Pages stay allowed even though indexing is controlled by metadata:
       a crawler blocked here never fetches the page, so it never sees a
       meta directive at all. */
    const [rule] = [robots().rules].flat();

    expect(rule?.allow).toBe('/');
    expect(rule?.disallow).toContain('/api/');
  });
});
