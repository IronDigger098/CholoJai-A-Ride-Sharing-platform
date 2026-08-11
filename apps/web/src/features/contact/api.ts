import {
  type ContactMessage,
  type ContactMessageListQuery,
  type ContactMessagePage,
  contactMessagePageSchema,
  contactMessageSchema,
  type SubmitContactMessageRequest,
} from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

/** Contact calls. Every response is parsed against the shared contract. */

/**
 * Write to support.
 *
 * No token is required. `apiClient` attaches one when there is a session, and
 * the endpoint uses it to link the message to an account — but a visitor with
 * no account reaches this the same way.
 */
export async function submitContactMessage(
  request: SubmitContactMessageRequest,
): Promise<ContactMessage> {
  const response = await apiClient.post('/contact', request);

  return contactMessageSchema.parse(response.data);
}

export async function listContactMessages(
  query: ContactMessageListQuery,
): Promise<ContactMessagePage> {
  const response = await apiClient.get('/admin/contact-messages', {
    params: query,
  });

  return contactMessagePageSchema.parse(response.data);
}

/** One argument, because that is what a React Query mutation passes. */
export interface SetHandledInput {
  readonly messageId: string;
  readonly handled: boolean;
}

export async function setContactMessageHandled({
  messageId,
  handled,
}: SetHandledInput): Promise<ContactMessage> {
  const response = await apiClient.patch(
    `/admin/contact-messages/${messageId}`,
    {
      handled,
    },
  );

  return contactMessageSchema.parse(response.data);
}
