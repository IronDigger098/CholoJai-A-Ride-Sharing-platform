import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { Link } from './link';

describe('Link', () => {
  it('renders an ordinary link by default', () => {
    render(<Link href="#fares">Fares</Link>);

    const link = screen.getByRole('link', { name: 'Fares' });
    expect(link).toHaveAttribute('href', '#fares');
    expect(link).not.toHaveAttribute('target');
    expect(link).not.toHaveAttribute('rel');
  });

  describe('when external', () => {
    it('closes the window.opener hole', () => {
      /* Without `noopener`, the opened page gets a reference back to this
         window and can navigate it somewhere else. The markup looks
         completely ordinary, which is exactly why this belongs in the
         primitive rather than in every author's memory. */
      render(
        <Link href="https://example.com" external>
          Docs
        </Link>,
      );

      const link = screen.getByRole('link', { name: /Docs/u });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('tells screen reader users the link leaves the site', () => {
      // Sighted users see a new tab appear. Without this, nobody else does.
      render(
        <Link href="https://example.com" external>
          Docs
        </Link>,
      );

      expect(
        screen.getByRole('link', { name: 'Docs (opens in a new tab)' }),
      ).toBeVisible();
    });
  });

  it('keeps caller classes alongside its own', () => {
    render(
      <Link href="#x" className="font-medium">
        X
      </Link>,
    );

    expect(screen.getByRole('link')).toHaveClass('font-medium');
  });
});
