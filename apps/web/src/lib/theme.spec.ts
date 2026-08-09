import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  applyTheme,
  getServerThemeSnapshot,
  getThemeSnapshot,
  isTheme,
  nextTheme,
  persistTheme,
  readStoredTheme,
  setTheme,
  subscribeToTheme,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from './theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  jest.restoreAllMocks();
});

describe('nextTheme', () => {
  it('cycles system, light, dark, and back', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});

describe('isTheme', () => {
  it('accepts the three themes and nothing else', () => {
    expect(isTheme('system')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(2)).toBe(false);
  });
});

describe('applyTheme', () => {
  it('sets the attribute for an explicit choice', () => {
    applyTheme('dark');

    expect(document.documentElement).toHaveAttribute(THEME_ATTRIBUTE, 'dark');
  });

  it('removes the attribute for system', () => {
    /* Not `data-theme="system"`. The stylesheet falls back to the
       prefers-color-scheme media query only when the attribute is absent,
       so an unrecognised value would pin the page to light mode — the
       exact opposite of "follow my system". */
    applyTheme('dark');
    applyTheme('system');

    expect(document.documentElement).not.toHaveAttribute(THEME_ATTRIBUTE);
  });
});

describe('storage', () => {
  it('round-trips an explicit choice', () => {
    persistTheme('light');

    expect(readStoredTheme()).toBe('light');
  });

  it('clears the entry for system rather than storing it', () => {
    persistTheme('dark');
    persistTheme('system');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(readStoredTheme()).toBe('system');
  });

  it('falls back to system for a corrupt value', () => {
    // Storage is shared with anything else on the origin, and survives
    // deploys. A value this code never wrote is a normal thing to find.
    localStorage.setItem(THEME_STORAGE_KEY, 'solarized');

    expect(readStoredTheme()).toBe('system');
  });

  it('survives storage that throws on read', () => {
    /* Safari in private mode and browsers with third-party storage
       blocked do not return null — they throw. Unguarded, that takes down
       the component tree over a colour preference. */
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(readStoredTheme()).toBe('system');
  });

  it('survives storage that throws on write', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => {
      persistTheme('dark');
    }).not.toThrow();
  });
});

describe('the external store', () => {
  it('notifies subscribers when the theme is set', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToTheme(listener);

    setTheme('dark');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getThemeSnapshot()).toBe('dark');

    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn();
    subscribeToTheme(listener)();

    setTheme('light');

    expect(listener).not.toHaveBeenCalled();
  });

  it('reports system to the server', () => {
    /* The server cannot see this browser's storage. Returning anything
       else would make React hydrate against a value it cannot know. */
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(getServerThemeSnapshot()).toBe('system');
  });

  it('follows a change made in another tab', () => {
    /* `storage` fires only in other documents on the origin, so this is
       the cross-tab path. Applying the theme here matters as much as
       announcing it: React re-rendering the toggle updates its label, but
       nothing else would touch <html> in this tab. */
    const listener = jest.fn();
    const unsubscribe = subscribeToTheme(listener);

    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    globalThis.dispatchEvent(
      new StorageEvent('storage', { key: THEME_STORAGE_KEY }),
    );

    expect(document.documentElement).toHaveAttribute(THEME_ATTRIBUTE, 'dark');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('ignores storage events for other keys', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToTheme(listener);

    globalThis.dispatchEvent(
      new StorageEvent('storage', { key: 'something-else' }),
    );

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });
});
