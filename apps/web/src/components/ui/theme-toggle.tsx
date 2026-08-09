'use client';

import { type ReactNode, useSyncExternalStore } from 'react';

import { Button } from './button';

import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  nextTheme,
  setTheme,
  subscribeToTheme,
  type Theme,
} from '@/lib/theme';

/**
 * Cycles the colour scheme between system, light, and dark.
 *
 * A client component, and one of the few that needs to be: the preference
 * lives in `localStorage` and on the `<html>` element rather than in React.
 *
 * `useSyncExternalStore` rather than `useState` plus an effect. The effect
 * version reads storage after mount and calls `setState`, which triggers a
 * second render pass and is what `react-hooks/set-state-in-effect` warns
 * about. This hook exists for precisely this shape of data: it takes a
 * separate server snapshot, so hydration matches the server's markup and
 * then reconciles to the real value without a mismatch — and subscribing
 * gets cross-tab updates for free, since another tab changing the theme
 * fires a `storage` event this store already listens for.
 */

const LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const GLYPHS: Record<Theme, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

export function ThemeToggle(): ReactNode {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function change(): void {
    setTheme(nextTheme(theme));
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={change}
      /* A stable accessible name. Putting the current mode in here instead
         would mean the name changes as the button is pressed, and a screen
         reader announces the control as if it were a different one. */
      aria-label="Change colour theme"
    >
      <span aria-hidden="true">{GLYPHS[theme]}</span>

      {/* `aria-live` because the button's own name never changes: without
          it, pressing this produces no feedback at all for a screen reader
          user, since the only thing that changed is colour. */}
      <span aria-live="polite" className="w-12 text-left">
        {LABELS[theme]}
      </span>
    </Button>
  );
}
