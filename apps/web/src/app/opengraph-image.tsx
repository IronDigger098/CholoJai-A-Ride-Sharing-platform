import { ImageResponse } from 'next/og';

import { SITE_NAME } from '@/lib/site';

/**
 * The social preview card.
 *
 * Generated rather than committed as a PNG: the headline lives in one
 * place, and a binary in the repository is the thing nobody remembers to
 * update when the copy changes.
 *
 * The colours are hard-coded rather than read from `theme.css`, which is
 * the one place in this codebase that is allowed. `ImageResponse` renders
 * in an isolated Satori environment with no stylesheet, no cascade, and no
 * custom properties — a token reference here would silently resolve to
 * nothing. The values are the light-scheme `surface`, `content` and
 * `accent`, and the comment is the link between them.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${SITE_NAME} — book a verified ride with an upfront fare`;

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        backgroundColor: '#f9fafb',
        color: '#2b2e31',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          fontSize: 28,
          letterSpacing: 6,
          textTransform: 'uppercase',
          color: '#006969',
        }}
      >
        CholoJai
      </div>

      <div
        style={{
          marginTop: 28,
          fontSize: 68,
          lineHeight: 1.1,
          fontWeight: 600,
          maxWidth: 900,
        }}
      >
        Book a verified ride with an upfront fare.
      </div>

      <div style={{ marginTop: 32, fontSize: 30, color: '#575b5e' }}>
        Transparent pricing · Checked drivers · Live tracking
      </div>

      <div
        style={{
          marginTop: 'auto',
          height: 10,
          width: 200,
          borderRadius: 999,
          backgroundColor: '#e7a64c',
        }}
      />
    </div>,
    size,
  );
}
