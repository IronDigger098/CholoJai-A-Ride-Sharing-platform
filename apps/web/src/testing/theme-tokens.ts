import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Oklch, parseOklch } from './color';

/**
 * Reads the design tokens out of `theme.css`.
 *
 * The stylesheet is the source of truth (ADR-014), so the test reads it
 * rather than a TypeScript copy of it. A copy would be the thing that
 * drifts: someone adjusts a colour in CSS, the test keeps asserting
 * against the old value, and it passes while the shipped palette fails.
 */

const THEME_PATH = join(__dirname, '..', 'styles', 'theme.css');

export type TokenMap = ReadonlyMap<string, string>;

export interface ThemeTokens {
  /** `teal-700` → `oklch(0.47 0.081 195)` */
  readonly palette: TokenMap;
  /** `accent` → `var(--color-teal-700)` */
  readonly light: TokenMap;
  readonly dark: TokenMap;
  /** The dark values from the `prefers-color-scheme` branch. */
  readonly darkFromMediaQuery: TokenMap;
}

const PALETTE_DECLARATION = /--color-([a-z]+-\d{2,3})\s*:\s*([^;]+);/gu;
const SEMANTIC_DECLARATION = /--([a-z-]+)\s*:\s*([^;]+);/gu;

/**
 * Pull out one top-level rule by its selector.
 *
 * Anchored to the start of a line, which is what distinguishes the
 * top-level `:root` block from the indented `:root:not(...)` inside the
 * media query. Crude, and adequate: this parses one file whose shape is
 * fixed by the same commit as the parser.
 */
function ruleBody(css: string, selector: string): string {
  const pattern = new RegExp(
    `^${selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}\\s*\\{([\\s\\S]*?)^\\}`,
    'mu',
  );
  const match = pattern.exec(css);

  if (match?.[1] === undefined) {
    throw new Error(`theme.css has no top-level rule for "${selector}"`);
  }

  return match[1];
}

function declarations(body: string, pattern: RegExp): TokenMap {
  const found = new Map<string, string>();

  for (const match of body.matchAll(pattern)) {
    const [, name, value] = match;

    if (name === undefined || value === undefined) continue;

    /* Not a colour token. `color-scheme` lives in the same blocks because
       it has to change with them. */
    if (name === 'color-scheme') continue;

    found.set(name, value.trim());
  }

  return found;
}

export function readThemeTokens(): ThemeTokens {
  const css = readFileSync(THEME_PATH, 'utf8');

  /* Selectors are passed unescaped — `ruleBody` escapes them. Escaping
     here as well produced a pattern matching literal backslashes, which
     matched nothing and reported the rule as missing. */
  const mediaQuery = ruleBody(css, '@media (prefers-color-scheme: dark)');

  return {
    palette: declarations(css, PALETTE_DECLARATION),
    light: declarations(ruleBody(css, ':root'), SEMANTIC_DECLARATION),
    dark: declarations(
      ruleBody(css, ":root[data-theme='dark']"),
      SEMANTIC_DECLARATION,
    ),
    darkFromMediaQuery: declarations(mediaQuery, SEMANTIC_DECLARATION),
  };
}

const VAR_REFERENCE = /^var\(\s*--color-([a-z]+-\d{2,3})\s*\)$/u;

/**
 * Turn a semantic token's value into a concrete colour.
 *
 * Semantic tokens point at the palette (`var(--color-teal-700)`) or, where
 * no palette entry fits, carry a literal. Both resolve here so callers
 * never have to care which.
 */
export function resolveToken(
  tokens: ThemeTokens,
  scheme: 'light' | 'dark',
  name: string,
): Oklch {
  const raw = tokens[scheme].get(name);

  if (raw === undefined) {
    throw new Error(`No "${name}" token in the ${scheme} scheme`);
  }

  const reference = VAR_REFERENCE.exec(raw);
  const value =
    reference?.[1] === undefined
      ? raw
      : (tokens.palette.get(reference[1]) ?? '');

  const color = parseOklch(value);

  if (color === null) {
    throw new Error(
      `Token "${name}" (${scheme}) is not an oklch colour: ${raw}`,
    );
  }

  return color;
}
