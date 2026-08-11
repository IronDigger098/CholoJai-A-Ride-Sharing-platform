import { NotFoundError } from '../../common/errors/domain-error';

export class ContactMessageNotFoundError extends NotFoundError {
  public readonly code = 'CONTACT_MESSAGE_NOT_FOUND';
  public readonly title = 'No such message';

  public constructor(messageId: string) {
    super(`No contact message has the id ${messageId}.`);
  }
}
