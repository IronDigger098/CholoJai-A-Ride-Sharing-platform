/** What the contact feature needs from persistence. */

export interface CreateContactMessageInput {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  /** The account the sender held, when they held one. */
  readonly userId?: string | undefined;
}

export interface ContactMessageRecord {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  readonly userId: string | null;
  readonly handledAt: Date | null;
  readonly createdAt: Date;
}

export interface ListContactMessagesOptions {
  readonly handled: boolean;
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface ContactMessagePageResult {
  readonly messages: readonly ContactMessageRecord[];
  readonly hasNextPage: boolean;
}

export interface ContactMessageRepository {
  create(input: CreateContactMessageInput): Promise<ContactMessageRecord>;

  /**
   * One page of the inbox, oldest first.
   *
   * Oldest rather than newest, which is the opposite of every other list in
   * this codebase and deliberate. A newest-first inbox pushes the messages
   * that have waited longest onto pages nobody scrolls to, so the rows most
   * overdue for an answer are the ones least likely to be seen.
   */
  list(options: ListContactMessagesOptions): Promise<ContactMessagePageResult>;

  /** Null when the id is unknown. */
  setHandled(
    messageId: string,
    handledAt: Date | null,
  ): Promise<ContactMessageRecord | null>;
}

export const CONTACT_MESSAGE_REPOSITORY = Symbol('CONTACT_MESSAGE_REPOSITORY');
