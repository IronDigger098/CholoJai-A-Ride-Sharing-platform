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
};

export default nextConfig;
