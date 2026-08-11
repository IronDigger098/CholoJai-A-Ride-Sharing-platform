import {
  type ContactMessagePageResult,
  type ContactMessageRecord,
  type ContactMessageRepository,
  type CreateContactMessageInput,
  type ListContactMessagesOptions,
} from '../modules/contact/contact-repository.port';

/**
 * In-memory {@link ContactMessageRepository}.
 *
 * The ordering is reproduced rather than assumed. Oldest-first is the whole
 * reason this table has the index it has, and a fake that returned insertion
 * order would agree with the adapter by coincidence right up until a test
 * inserted out of order.
 */
export class InMemoryContactMessageRepository implements ContactMessageRepository {
  public readonly rows: ContactMessageRecord[] = [];
  private sequence = 0;

  public async create(
    input: CreateContactMessageInput,
  ): Promise<ContactMessageRecord> {
    this.sequence += 1;

    const record: ContactMessageRecord = {
      id: `contact_${this.sequence}`,
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
      userId: input.userId ?? null,
      handledAt: null,
      /* Spaced a second apart so ordering is decidable. Rows created inside
         one millisecond would fall back to the id tiebreak, which is
         exactly the case a test about ordering should not depend on. */
      createdAt: new Date(Date.UTC(2026, 7, 1) + this.sequence * 1000),
    };

    this.rows.push(record);

    return record;
  }

  public async list(
    options: ListContactMessagesOptions,
  ): Promise<ContactMessagePageResult> {
    const matching = this.rows
      .filter((row) => (row.handledAt !== null) === options.handled)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const start =
      options.cursor === undefined
        ? 0
        : matching.findIndex((row) => row.id === options.cursor) + 1;

    const page = matching.slice(start, start + options.limit);

    return {
      messages: page,
      hasNextPage: matching.length > start + options.limit,
    };
  }

  public async setHandled(
    messageId: string,
    handledAt: Date | null,
  ): Promise<ContactMessageRecord | null> {
    const index = this.rows.findIndex((row) => row.id === messageId);

    if (index === -1) return null;

    const existing = this.rows[index];

    if (existing === undefined) return null;

    const updated = { ...existing, handledAt };
    this.rows[index] = updated;

    return updated;
  }
}
