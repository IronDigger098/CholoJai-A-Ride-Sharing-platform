import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

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
    /* No `data-theme` attribute: without one the tokens follow the
       operating system, which is the right default. The toggle that sets
       it arrives with the primitives in M4.3. */
    <html lang="en">
      <body className="bg-surface text-content min-h-dvh font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
