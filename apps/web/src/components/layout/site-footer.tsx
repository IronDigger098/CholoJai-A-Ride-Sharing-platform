import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';

const REPOSITORY =
  'https://github.com/IronDigger098/CholoJai-A-Ride-Sharing-platform';

export function SiteFooter(): ReactNode {
  return (
    <footer className="border-border border-t">
      <div className="text-content-muted mx-auto max-w-5xl px-6 py-10 text-sm">
        <p className="text-content font-semibold">
          CholoJai <span className="text-accent font-medium">চলো যাই</span>
        </p>

        <p className="mt-3 max-w-prose text-pretty">
          A portfolio project: a ride-sharing platform for Bangladesh&rsquo;s
          urban market, built to production engineering standards. Inspired by
          the publicly observable experience of ride-sharing products; all code,
          branding, copy, and architecture here are original work.
        </p>

        <p className="mt-6">
          <Link href={REPOSITORY} external className="font-medium">
            Source on GitHub
          </Link>
        </p>

        {/* A fixed year rather than `new Date()`. This page is statically
            rendered, so a computed year freezes at build time and then
            quietly goes stale — worse than a number that is honestly
            constant. */}
        <p className="text-content-subtle mt-6 text-xs">
          © 2026 CholoJai. Not a real transport service.
        </p>
      </div>
    </footer>
  );
}
