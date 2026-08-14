import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

/**
 * Next.js configuration.
 *
 * Deliberately small. Every option here is one the framework's default is
 * wrong for *this* application, and each is explained — a config file full
 * of settings nobody can justify is how a build slowly becomes unexplainable.
 */
const nextConfig: NextConfig = {
  /* Double-invokes renders and effects in development to surface impure
     components and missing effect cleanup. It is noisy the first time it
     catches something, which is the point: the alternative is finding the
     same bug in production, once, under concurrent rendering. */
  reactStrictMode: true,

  /* `X-Powered-By: Next.js` tells an attacker the framework and narrows
     their search for known CVEs. It buys us nothing in exchange. */
  poweredByHeader: false,

  /* Statically typed `href` values on Link and router calls. A renamed
     route becomes a compile error at every call site instead of a 404 a
     user finds. Promoted out of `experimental` in Next.js 16. */
  typedRoutes: true,

  /* Emits a self-contained `.next/standalone` with only the files the
     server actually reaches. Vercel does not need it — it traces the same
     dependencies itself — but it is what makes this app deployable
     anywhere else without a `node_modules` the size of the workspace. A
     build output that only one host can run is a lock-in nobody chose. */
  output: 'standalone',

  /* `Promise.resolve`, not an `async` method with nothing to await. Next
     types `headers` as returning a promise, so it has to be one — but
     marking it async without an await is exactly what `require-await`
     exists to catch, and silencing that rule here would be silencing it
     for the one file where it is right. */
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: SECURITY_HEADERS }]);
  },
};

/**
 * Headers the framework does not set and the platform will not guess.
 *
 * Set here rather than in `vercel.json` so they apply identically under
 * `next start`, in a container, and on Vercel. A security posture that only
 * exists on one host is one nobody can verify locally.
 *
 * There is deliberately no Content-Security-Policy. A real one for this app
 * needs a per-request nonce — Next inlines its own bootstrap script — and a
 * policy with `unsafe-inline` is a policy that stops nothing while looking
 * like protection. It belongs with the middleware work, not here.
 */
const SECURITY_HEADERS = [
  /* Stops a browser from second-guessing a Content-Type. Without it a
     user-uploaded file served as text/plain can be sniffed as HTML and
     executed on our origin. */
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  /* No framing at all. Clickjacking a booking form means a rider confirms
     a ride they cannot see; nothing here has any reason to be embedded. */
  { key: 'X-Frame-Options', value: 'DENY' },

  /* Send the full URL to ourselves, only the origin to anyone else, and
     nothing at all over plain HTTP. A ride page's path contains an id, and
     a bare `Referer` would hand it to every third-party asset. */
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  /* Nothing here uses a camera, a microphone or payment APIs, so the
     honest policy is to deny them outright. Geolocation is denied too:
     pickup comes from the map and the geocoder, not from the device, and a
     permission the product never asks for should not be available to a
     script that arrives later. */
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },

  /* Two years, subdomains included. Long is the point — a short max-age
     leaves a window where a first visit can be downgraded. Not preloaded:
     that is a submission to a browser-vendor list which is slow to leave,
     and it is not a decision to make from a config file. */
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
];

/**
 * The plugin's only job is to tell the bundler where `getRequestConfig`
 * lives, so server components can read messages without every one of them
 * being handed a locale. Pointed at the file explicitly rather than relying
 * on the convention, because the convention is a path in someone else's
 * documentation and this is a path in ours.
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
