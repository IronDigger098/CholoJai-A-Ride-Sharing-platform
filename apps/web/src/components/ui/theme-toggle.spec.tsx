import { afterEach, describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeToggle } from './theme-toggle';

import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from '@/lib/theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe('ThemeToggle', () => {
  it('starts from the stored preference', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    render(<ThemeToggle />);

    expect(await screen.findByText('Dark')).toBeVisible();
  });

  it('shows System when nothing is stored', async () => {
    render(<ThemeToggle />);

    expect(await screen.findByText('System')).toBeVisible();
  });

  it('keeps one accessible name across changes', async () => {
    /* The name must not describe the current mode. If it did, the control
       would announce itself as a different button each time it is pressed,
       and anyone navigating by name would lose it. */
    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: 'Change colour theme' });
    await userEvent.click(button);

    expect(
      screen.getByRole('button', { name: 'Change colour theme' }),
    ).toBeVisible();
  });

  it('cycles system to light to dark and back', async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');

    await userEvent.click(button);
    expect(document.documentElement).toHaveAttribute(THEME_ATTRIBUTE, 'light');

    await userEvent.click(button);
    expect(document.documentElement).toHaveAttribute(THEME_ATTRIBUTE, 'dark');

    await userEvent.click(button);
    expect(document.documentElement).not.toHaveAttribute(THEME_ATTRIBUTE);
  });

  it('persists an explicit choice and clears it for system', async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');

    await userEvent.click(button);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await userEvent.click(button);
    await userEvent.click(button);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('announces the change for screen readers', async () => {
    /* The button's name is stable and the only other change is colour, so
       without a live region a screen reader user gets no confirmation that
       pressing it did anything at all. */
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button'));

    const label = await screen.findByText('Light');
    expect(label).toHaveAttribute('aria-live', 'polite');
  });

  it('hides the decorative glyph from assistive technology', () => {
    render(<ThemeToggle />);

    expect(
      screen.getByRole('button').querySelector('[aria-hidden="true"]'),
    ).not.toBeNull();
  });
});
