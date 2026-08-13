import { z } from 'zod';

/**
 * Global search — `docs/roadmap.md` M10b.
 *
 * One box over three things that have nothing in common: the rider's own
 * rides, their saved places, and the help articles. The hard part is not
 * finding matches, it is putting them in one order.
 *
 * **There is no cross-source relevance score, on purpose.** Scoring a ride
 * against a help article means inventing a number that says a journey to
 * Banani is 0.7 relevant and an answer about promo codes is 0.6, and that
 * number would be fiction — it has no unit and nothing to calibrate
 * against. Anything built on it would look principled and behave
 * arbitrarily.
 *
 * Instead the results are **grouped by kind, in a fixed order**, with each
 * group ranked by a rule that makes sense within it: places by how recently
 * they were saved, rides by how recently they happened, help by where the
 * match landed. Somebody who types "banani" gets their places first because
 * a saved place is the thing most likely to be wanted from a single word;
 * somebody who types "refund" gets help, because nothing else will match.
 * The grouping does the work that a fake score would have pretended to do.
 */

export const SearchResultKind = {
  PLACE: 'PLACE',
  RIDE: 'RIDE',
  HELP: 'HELP',
} as const;

export type SearchResultKind =
  (typeof SearchResultKind)[keyof typeof SearchResultKind];

/**
 * The order groups appear in, and the reason for it.
 *
 * Places first: a saved place is a shortcut the rider made deliberately, so
 * a match there is almost always what they meant. Rides second: history is
 * a lot of rows and a match is more likely coincidence. Help last: it is
 * the fallback when nothing personal matched, and it is the only source
 * that can match a word like "refund" at all.
 */
export const SEARCH_KIND_ORDER: readonly SearchResultKind[] = [
  SearchResultKind.PLACE,
  SearchResultKind.RIDE,
  SearchResultKind.HELP,
];

/**
 * One result, whatever it is.
 *
 * A discriminated union rather than a lowest-common-denominator shape with
 * optional fields. `{ kind, title, subtitle, href }` for everything would
 * force the caller to guess what it is holding; this way the compiler knows,
 * and a renderer that forgets a case will not compile.
 */
export const searchResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(SearchResultKind.PLACE),
    id: z.string(),
    label: z.string(),
    address: z.string(),
  }),
  z.object({
    kind: z.literal(SearchResultKind.RIDE),
    id: z.string(),
    pickupAddress: z.string(),
    dropoffAddress: z.string(),
    farePaisa: z.number().int().nonnegative(),
    requestedAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal(SearchResultKind.HELP),
    slug: z.string(),
    question: z.string(),
    answer: z.string(),
  }),
]);

export type SearchResult = z.infer<typeof searchResultSchema>;

/**
 * What a search asks for.
 *
 * Two characters minimum. One character matches most of a rider's history
 * and tells them nothing, and the query is a `contains` scan — a
 * single-letter search is the most expensive question with the least
 * useful answer.
 */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  /** Per source, not overall. Ten places and ten rides is still readable. */
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResponseSchema = z.object({
  /** Already grouped and ordered by the server. Clients render in order. */
  results: z.array(searchResultSchema),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

/** Section headings, so every client names the groups identically. */
export const SEARCH_KIND_LABEL: Record<SearchResultKind, string> = {
  [SearchResultKind.PLACE]: 'Saved places',
  [SearchResultKind.RIDE]: 'Your rides',
  [SearchResultKind.HELP]: 'Help',
};
