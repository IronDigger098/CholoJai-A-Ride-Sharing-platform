import { Module } from '@nestjs/common';

import { MockPaymentGateway } from './mock-payment.gateway';
import { PAYMENT_GATEWAY } from './payment-gateway.port';
import { PAYMENT_REPOSITORY } from './payment-repository.port';
import { PaymentsService } from './payments.service';
import { PrismaPaymentRepository } from './prisma-payment.repository';

/**
 * Payments.
 *
 * Depends on nothing but persistence. Rides calls it — authorise, capture,
 * cancel — and it never calls back: it is told the amount rather than
 * reading a ride to find one, which is what keeps the fare snapshot the
 * single source of the number (D2) and keeps this module out of a cycle.
 *
 * `MockPaymentGateway` is bound to the port here and nowhere else. When a
 * real processor arrives in M12 this line changes and nothing else does —
 * which is the entire reason the port exists.
 *
 * No controller. Nothing outside this module needs to move money directly;
 * payments happen because rides happen, and an endpoint that charged a card
 * without a ride behind it would be a way to charge a card without a ride
 * behind it.
 */
@Module({
  providers: [
    PaymentsService,
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
