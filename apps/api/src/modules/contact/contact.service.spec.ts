import { describe, expect, it, beforeEach } from '@jest/globals';

import { InMemoryContactMessageRepository } from '../../testing/in-memory-contact-message.repository';

import { ContactService } from './contact.service';

const SENDER = 'user_rider_1';

const MESSAGE = {
  name: 'Nabila Rahman',
  email: 'nabila@example.test',
  subject: 'Driver took a longer route',
  message: 'My ride last night went the wrong way and cost more than quoted.',
};

describe('ContactService', () => {
  let messages: InMemoryContactMessageRepository;
  let service: ContactService;

  beforeEach(() => {
    messages = new InMemoryContactMessageRepository();
    service = new ContactService(messages);
  });

  async function submitMany(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await service.submit({ ...MESSAGE, subject: `Issue ${index}` }, null);
    }
  }

  describe('submit', () => {
    it('stores a message from somebody with no account', async () => {
      /* The case the endpoint exists for. Somebody who cannot sign in is
         exactly the person who needs to reach support. */
      const stored = await service.submit(MESSAGE, null);

      expect(stored.userId).toBeNull();
      expect(stored.email).toBe('nabila@example.test');
      expect(stored.handledAt).toBeNull();
    });

    it('links a signed-in sender to their account', async () => {
      const stored = await service.submit(MESSAGE, SENDER);

      expect(stored.userId).toBe(SENDER);
    });

    it('never infers an account from the address typed', async () => {
      /* A stranger can type anybody's email. An account link built from an
         unverified string would attach a real person to a message they did
         not send. */
      const stored = await service.submit(MESSAGE, null);

      expect(stored.userId).toBeNull();
    });

    it('arrives unhandled', async () => {
      const stored = await service.submit(MESSAGE, null);

      expect(stored.handledAt).toBeNull();
    });
  });

  describe('list', () => {
    it('returns the work rather than the archive by default', async () => {
      await submitMany(2);
      await service.setHandled('contact_1', true);

      const page = await service.list({ handled: false, limit: 20 });

      expect(page.data.map((row) => row.id)).toEqual(['contact_2']);
    });

    it('returns handled messages when asked for them', async () => {
      await submitMany(2);
      await service.setHandled('contact_1', true);

      const page = await service.list({ handled: true, limit: 20 });

      expect(page.data.map((row) => row.id)).toEqual(['contact_1']);
    });

    it('puts the longest-waiting message first', async () => {
      /* The opposite of every other list in this codebase. A newest-first
         inbox pushes the messages that have waited longest onto pages
         nobody scrolls to. */
      await submitMany(3);

      const page = await service.list({ handled: false, limit: 20 });

      expect(page.data.map((row) => row.id)).toEqual([
        'contact_1',
        'contact_2',
        'contact_3',
      ]);
    });

    it('walks the inbox without repeating or skipping a message', async () => {
      await submitMany(5);

      const first = await service.list({ handled: false, limit: 2 });
      const second = await service.list({
        handled: false,
        limit: 2,
        cursor: first.pageInfo.nextCursor ?? undefined,
      });

      expect(first.data.map((row) => row.id)).toEqual([
        'contact_1',
        'contact_2',
      ]);
      expect(second.data.map((row) => row.id)).toEqual([
        'contact_3',
        'contact_4',
      ]);
    });

    it('reports no next page on the last one', async () => {
      /* Null rather than the last id, so a client cannot loop forever
         asking for more. */
      await submitMany(2);

      const page = await service.list({ handled: false, limit: 20 });

      expect(page.pageInfo.hasNextPage).toBe(false);
      expect(page.pageInfo.nextCursor).toBeNull();
    });
  });

  describe('setHandled', () => {
    it('records when a message was dealt with', async () => {
      await service.submit(MESSAGE, null);

      const handled = await service.setHandled('contact_1', true);

      expect(handled?.handledAt).not.toBeNull();
    });

    it('puts one back, because handling is a note and not a transition', async () => {
      /* A one-way checkbox turns a single misclick into a message nobody
         ever looks at again. */
      await service.submit(MESSAGE, null);
      await service.setHandled('contact_1', true);

      const reopened = await service.setHandled('contact_1', false);

      expect(reopened?.handledAt).toBeNull();
      expect(
        (await service.list({ handled: false, limit: 20 })).data,
      ).toHaveLength(1);
    });

    it('reports an unknown id as null rather than throwing', async () => {
      /* The controller turns this into a 404 with a sentence of its own. A
         service that threw would decide the status code for every caller. */
      await expect(
        service.setHandled('contact_nope', true),
      ).resolves.toBeNull();
    });
  });
});
