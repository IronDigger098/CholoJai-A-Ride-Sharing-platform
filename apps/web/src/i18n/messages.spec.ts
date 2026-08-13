import { describe, expect, it } from '@jest/globals';

import bn from '../../messages/bn.json';
import en from '../../messages/en.json';

/**
 * The two catalogues must describe the same set of messages.
 *
 * next-intl falls back to the key itself when a message is missing, so a
 * key added to `en.json` and forgotten in `bn.json` renders as
 * `settings.appearanceHint` on a Bangla screen — visible only to somebody
 * reading Bangla, which is nobody on this project. A key removed from
 * English and left in Bangla is the quieter half of the same problem: dead
 * copy that a translator will keep maintaining.
 *
 * This is the whole reason the catalogues are worth a test. The strings
 * themselves are unassertable — there is no correct translation to compare
 * against — but their *shape* is exactly checkable, and shape is what goes
 * wrong.
 */

interface Tree {
  [key: string]: string | Tree;
}

/** Every leaf path, dot-joined and sorted. Order must not matter. */
function paths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree)
    .flatMap(([key, value]) => {
      const path = prefix === '' ? key : `${prefix}.${key}`;

      return typeof value === 'string' ? [path] : paths(value, path);
    })
    .sort((a, b) => a.localeCompare(b));
}

const english = paths(en);
const bangla = paths(bn);

describe('message catalogues', () => {
  it('define exactly the same keys', () => {
    /* Compared as arrays rather than with two `toContain` loops, so the
       failure names every key that differs at once instead of the first. */
    expect(bangla).toEqual(english);
  });

  it('leave no message empty', () => {
    /* An empty string is worse than a missing key: next-intl renders
       nothing at all rather than falling back, so the label simply
       vanishes and the layout closes over the gap. */
    const empty = [...english, ...bangla].filter((path) => {
      const from = (tree: Tree): string =>
        path
          .split('.')
          .reduce<string | Tree>(
            (node, key) => (node as Tree)[key] ?? '',
            tree,
          ) as string;

      return from(en).trim() === '' || from(bn).trim() === '';
    });

    expect(empty).toEqual([]);
  });

  it('keeps every placeholder in both languages', () => {
    /* `{max}` dropped from a translation renders the sentence without the
       number, which reads as finished prose and is simply wrong. An
       *extra* placeholder throws at render time instead. Either way the
       set has to match. */
    function placeholders(value: string): string[] {
      return [...value.matchAll(/\{(\w+)\}/gu)]
        .map((match) => match[1] ?? '')
        .sort((a, b) => a.localeCompare(b));
    }

    function read(tree: Tree, path: string): string {
      return path
        .split('.')
        .reduce<string | Tree>(
          (node, key) => (node as Tree)[key] ?? '',
          tree,
        ) as string;
    }

    const mismatched = english.filter(
      (path) =>
        placeholders(read(en as Tree, path)).join() !==
        placeholders(read(bn as Tree, path)).join(),
    );

    expect(mismatched).toEqual([]);
  });
});
