import { z } from 'zod';

/**
 * The platform's pagination envelope — `docs/api-design.md` §3.
 *
 * Promoted out of `rides.contracts.ts`, which wrote itself a note saying
 * this shape would move here when a second collection needed it. The admin
 * user directory is that second caller, so the note is being honoured rather
 * than the shape copied.
 *
 * Cursor rather than offset, because every list in this product is written
 * to while it is read. `OFFSET 20` shifts the moment a row is inserted, so
 * the reader sees one entry twice and never sees another; seeking on an
 * indexed key is stable and stays flat at depth. The cost is no random page
 * access — "give me page 4" is a question these endpoints cannot answer, and
 * nothing in this product asks it.
 *
 * No `paginated(schema)` helper. Writing the envelope out per collection is
 * two lines; a generic that produces it needs a return type only its author
 * can read, and Swagger has to be told the concrete shape either way.
 */

export const pageInfoSchema = z.object({
  /** Pass as `cursor` to fetch the next page. Null on the last page. */
  nextCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
});

export type PageInfo = z.infer<typeof pageInfoSchema>;

/**
 * What a caller may ask for.
 *
 * `limit` is capped. Without a ceiling the page size is chosen by whoever is
 * calling, and "give me everything" is one request away from being the
 * slowest query in the system.
 */
export const cursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(64).optional(),
});

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;
