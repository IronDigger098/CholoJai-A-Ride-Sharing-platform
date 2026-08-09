/**
 * Colour-scheme preference.
 *
 * Three states, not two. "Light" and "Dark" are choices; `system` is the
 * absence of one, and it is a real answer rather than a default nobody
 * picked — a person who changes their laptop to dark at sunset expects
 * this site to follow. A two-state toggle silently converts every visitor
 * into someone with an opinion.
 */

export const THEME_STORAGE_KEY = 'cholojai-theme';
export const THEME_ATTRIBUTE = 'data-theme';

export const THEMES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.includes(value as Theme);
}

/** Cycles system → light → dark → system. */
export function nextTheme(current: Theme): Theme {
  const index = THEMES.indexOf(current);

  /* `?? 'system'` is unreachable for a valid `Theme`, and stays because
     `noUncheckedIndexedAccess` is right that an index into an array is not
     a proof of presence. */
  return THEMES[(index + 1) % THEMES.length] ?? 'system';
}

/**
 * Every storage access is guarded.
 *
 * `localStorage` is not merely empty in private browsing and with
 * third-party storage blocked — reading it *throws*. An unguarded access
 * here would take the whole component down over a preference.
 */
export function readStoredTheme(): Theme {
  try {
    const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function persistTheme(theme: Theme): void {
  try {
    if (theme === 'system') {
      globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }

    globalThis.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* A preference that cannot be saved is a preference that lasts one
       session. That is a worse experience, not a broken one. */
  }
}

/**
 * Apply the preference to the document.
 *
 * `system` *removes* the attribute rather than setting it to "system".
 * The stylesheet's fallback is the `prefers-color-scheme` media query, and
 * it only applies when no attribute is present — an attribute value the
 * CSS does not recognise would leave the page stuck in light mode.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  if (theme === 'system') {
    root.removeAttribute(THEME_ATTRIBUTE);
    return;
  }

  root.setAttribute(THEME_ATTRIBUTE, theme);
}

/* ─── The preference as an external store ──────────────────────────────
 *
 * The theme lives in `localStorage` and on the `<html>` element, not in
 * React state — a blocking script sets it before React exists, and another
 * tab can change it at any moment. `useSyncExternalStore` is React's
 * interface for exactly that shape of data, and it is why this file
 * exposes a subscribe/snapshot pair rather than the component reading
 * storage inside an effect.
 */

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * A change made in another tab.
 *
 * The `storage` event fires only in *other* documents on the origin, so
 * this is the cross-tab path and never the local one. The theme has to be
 * applied here as well as announced: React re-rendering the toggle updates
 * its label, but nothing else would touch `<html>` in this tab.
 */
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;

  applyTheme(readStoredTheme());
  notify();
}

export function subscribeToTheme(listener: () => void): () => void {
  if (listeners.size === 0) {
    globalThis.addEventListener('storage', onStorage);
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      globalThis.removeEventListener('storage', onStorage);
    }
  };
}

/** The current preference. A primitive, so referential equality is fine. */
export function getThemeSnapshot(): Theme {
  return readStoredTheme();
}

/**
 * What the server renders.
 *
 * Always `system`: the server cannot see this browser's storage. React
 * hydrates against this value and then swaps in the client snapshot,
 * which is the mechanism that makes reading external state safe under SSR
 * instead of a hydration mismatch.
 */
export function getServerThemeSnapshot(): Theme {
  return 'system';
}

/** Persist, apply, and tell every subscriber in this tab. */
export function setTheme(theme: Theme): void {
  persistTheme(theme);
  applyTheme(theme);
  notify();
}
