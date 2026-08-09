import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { ThemeScript } from '@/components/theme-script';

import '@/styles/globals.css';

/**
 * The root layout wraps every route in the application.
 *
 * It is a Server Component and must stay one: anything marked `'use client'`
 * here would ship the entire tree to the browser as client code. State that
 * genuinely needs the client — the theme toggle in M4.2, for instance —
 * belongs in a small client component this layout renders, not in the
 * layout itself.
 */

export const metadata: Metadata = {
  /* `template` applies to every child route that sets its own title, so
     pages declare only their own name and the brand suffix is never
     forgotten or spelled three different ways. */
  title: {
    default: 'CholoJai — rides across Bangladesh',
    template: '%s · CholoJai',
  },
  description:
    'Upfront fares, verified drivers, and live tracking for everyday journeys.',
  applicationName: 'CholoJai',
};

export const viewport: Viewport = {
  /* Not `maximum-scale=1`. Blocking zoom is a common default in app
     templates and it makes the product unusable for anyone who needs to
     magnify text — a WCAG 1.4.4 failure, and one nobody on the team will
     ever notice themselves. */
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    /*
     * No `data-theme` here: without one the tokens follow the operating
     * system, which is the right default. `ThemeScript` adds the attribute
     * before first paint when someone has chosen otherwise.
     *
     * `suppressHydrationWarning` is required *because* of that script. It
     * mutates <html> before React attaches, so the DOM legitimately
     * differs from the server's markup and React would otherwise report a
     * mismatch. It is scoped to this one element and suppresses nothing
     * inside it.
     */
    <html lang="en" suppressHydrationWarning>
      <body className="bg-surface text-content min-h-dvh font-sans antialiased">
        {/* First child of <body> on purpose — see ThemeScript. It has to
            run during parsing, before anything exists to paint. */}
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
