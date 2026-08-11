import {
  contactMessageIdParamSchema,
  contactMessageListQuerySchema,
  contactMessagePageSchema,
  contactMessageSchema,
  setContactMessageHandledRequestSchema,
  submitContactMessageRequestSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * The contact surface, typed from the shared contracts.
 *
 * `handled` on the query is a string over the wire — `?handled=true` is the
 * five characters, not the boolean — which is why the schema accepts both
 * and coerces. A schema that demanded a boolean would reject every real
 * request while passing every test that called the service directly.
 */
export class SubmitContactMessageRequestDto extends createZodDto(
  submitContactMessageRequestSchema,
) {}

export class ContactMessageListQueryDto extends createZodDto(
  contactMessageListQuerySchema,
) {}

export class ContactMessageIdParamDto extends createZodDto(
  contactMessageIdParamSchema,
) {}

export class SetContactMessageHandledRequestDto extends createZodDto(
  setContactMessageHandledRequestSchema,
) {}

export class ContactMessageDto extends createZodDto(contactMessageSchema) {}

export class ContactMessagePageDto extends createZodDto(
  contactMessagePageSchema,
) {}
