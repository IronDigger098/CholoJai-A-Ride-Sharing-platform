import { describe, expect, it } from '@jest/globals';
import { type RenderResult, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HomePage from './page';

import type { ReactElement } from 'react';

import { renderWithProviders } from '@/testing/render-with-providers';

/**
 * `setRequestLocale` reads the request store, which does not exist outside
 * a Next server render. It is an optimisation hint — it opts the tree into
 * static rendering — so a no-op here changes nothing this file asserts.
 * The alternative is standing up a request context to make one function
 * call succeed.
 */
jest.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
}));

/**
 * Structural and accessibility assertions for the landing page.
 *
 * Deliberately nothing about copy. Marketing text changes weekly and a
 * test that asserts a sentence is a test that gets deleted rather than
 * fixed. What must not change is the structure people navigate by:
 * landmarks, one first-level heading, an unbroken heading order, and a
 * working skip link.
 */

/**
 * Render the page.
 *
 * The page became an async Server Component in M10b — it awaits `params`
 * to learn its locale — and Testing Library renders elements, not
 * promises. Calling it and awaiting the element it returns is the whole
 * adaptation; every assertion below is unchanged.
 */
async function renderHome(locale = 'en'): Promise<RenderResult> {
  /* `ReactNode` includes `undefined` and `render` wants an element. The
     page always returns a fragment, so the assertion states what the
     signature is too loose to. */
  const page = (await HomePage({
    params: Promise.resolve({ locale }),
  })) as ReactElement;

  return renderWithProviders(page, locale);
}
describe('the landing page', () => {
  it('provides the landmarks assistive technology navigates by', async () => {
    await renderHome();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  });

  it('has exactly one first-level heading', async () => {
    /* Screen reader users jump between headings to understand a page.
       Two h1s means two claims about what the page is about; none means
       the page has no title in that outline at all. */
    await renderHome();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('never skips a heading level', async () => {
    /* An h2 followed by an h4 tells a screen reader there is a missing
       section between them. It is invisible on screen — the h4 is simply
       styled smaller — and it is the most common heading fault there is. */
    const { container } = await renderHome();

    const levels = [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(
      (heading) => Number(heading.tagName[1]),
    );

    const jumps = levels.filter((level, index) => {
      const previous = levels[index - 1];
      return previous !== undefined && level > previous + 1;
    });

    expect(jumps).toEqual([]);
  });

  it('starts with a skip link that reaches the content', async () => {
    /* The first tab stop on any page with navigation should be a way past
       it. This also checks the target can actually receive focus — a skip
       link pointing at a non-focusable element moves the scroll position
       and leaves the keyboard exactly where it was. */
    await renderHome();

    await userEvent.tab();

    const skipLink = screen.getByRole('link', { name: 'Skip to content' });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });

  it('labels every section by its own heading', async () => {
    /* `aria-labelledby` is what turns a <section> into a landmark a
       screen reader can list and jump to. Without it the element is
       announced as a generic region, or not at all. */
    const { container } = await renderHome();

    const sections = [...container.querySelectorAll('section[id]')];
    expect(sections.length).toBeGreaterThan(0);

    const unlabelled = sections
      .filter((section) => section.getAttribute('aria-labelledby') === null)
      .map((section) => section.id);

    expect(unlabelled).toEqual([]);
  });

  it('displays a fare total equal to the sum of its displayed lines', async () => {
    /* Not "does the arithmetic work" — the engine's own tests cover that
       across hundreds of inputs. This checks the *rendered* figures, which
       round independently of each other: `formatTaka` defaults to whole
       taka, so a ৳8.80 line shows as ৳9 and a ৳184.80 total as ৳185, and
       a column that visibly fails to add up is exactly what this section
       claims never happens.

       Honest limit: for *this* route the two roundings happen to cancel
       (৳50 + ৳126 + ৳9 = ৳185, and the total also shows ৳185), so this
       assertion alone would not have caught the fault. It guards the page
       against a future route where they do not cancel; the general rule
       is pinned in `fare.test.ts`, which carries a worked counterexample. */
    const { container } = await renderHome();

    const card = container.querySelector('#fares [aria-labelledby]');
    const amounts = [...(card?.querySelectorAll('dd') ?? [])].map((cell) =>
      Number(cell.textContent?.replace(/[^\d.]/gu, '')),
    );

    const total = Number(
      card?.querySelector('.text-xl')?.textContent?.replace(/[^\d.]/gu, ''),
    );

    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(
      total,
      2,
    );
  });

  it('opens external links safely', async () => {
    await renderHome();

    const repository = screen.getByRole('link', { name: /Source on GitHub/u });

    expect(repository).toHaveAttribute('target', '_blank');
    expect(repository).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
