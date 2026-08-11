import { z } from 'zod';

import { cursorPageQuerySchema, pageInfoSchema } from './pagination.contracts';

/**
 * Contact messages — `docs/roadmap.md` M9b.
 *
 * The only write endpoint in the product that does not require an account.
 * Someone who cannot sign in is exactly the person most likely to need to
 * reach support, so gating this behind auth would close the door on the
 * cases it exists for.
 *
 * That openness is also why the shape is small and the lengths are capped:
 * an unauthenticated writer is a spam target, and every field here is one
 * an anonymous caller controls.
 */

export const submitContactMessageRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /* Lowercased for the same reason accounts are: two messages from the same
     person should look like they came from the same person. */
  email: z.string().trim().toLowerCase().email().max(255),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(10).max(4000),
});

export type SubmitContactMessageRequest = z.infer<
  typeof submitContactMessageRequestSchema
>;

/**
 * A message, as an administrator reads it.
 *
 * `userId` is the account the sender was signed in as, when they were. It is
 * not derived from the email: a stranger can type anybody's address, and
 * showing an administrator an account link built from an unverified string
 * would attach a real person to a message they never sent.
 */
export const contactMessageSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  subject: z.string(),
  message: z.string(),
  userId: z.string().nullable(),
  handledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type ContactMessage = z.infer<typeof contactMessageSchema>;

/**
 * The inbox query.
 *
 * `handled` defaults to false, so the unfiltered request returns the work
 * rather than the archive.
 */
export const contactMessageListQuerySchema = cursorPageQuerySchema.extend({
  handled: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
});

export type ContactMessageListQuery = z.infer<
  typeof contactMessageListQuerySchema
>;

export const contactMessagePageSchema = z.object({
  data: z.array(contactMessageSchema),
  pageInfo: pageInfoSchema,
});

export type ContactMessagePage = z.infer<typeof contactMessagePageSchema>;

export const contactMessageIdParamSchema = z.object({
  messageId: z.string().min(1).max(64),
});

export type ContactMessageIdParam = z.infer<typeof contactMessageIdParamSchema>;

/**
 * Marking one done, or putting it back.
 *
 * Reversible on purpose. Handling is a note about who still owes a reply,
 * not a state transition with consequences — and an irreversible checkbox
 * turns one misclick into a message nobody ever looks at again.
 */
export const setContactMessageHandledRequestSchema = z.object({
  handled: z.boolean(),
});

export type SetContactMessageHandledRequest = z.infer<
  typeof setContactMessageHandledRequestSchema
>;
