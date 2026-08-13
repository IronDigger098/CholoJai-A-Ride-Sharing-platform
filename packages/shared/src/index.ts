/**
 * @cholojai/shared — contracts shared by the web app and the API.
 *
 * Anything defined here is a promise both sides keep. Adding to this package
 * means "both apps must agree on this"; if only one app needs it, it does
 * not belong here.
 */

export * from './api/admin.contracts';
export * from './api/analytics.contracts';
export * from './api/auth.contracts';
export * from './api/contact.contracts';
export * from './api/coupons.contracts';
export * from './api/drivers.contracts';
export * from './api/fares.contracts';
export * from './api/geo.contracts';
export * from './api/notifications.contracts';
export * from './api/pagination.contracts';
export * from './api/payments.contracts';
export * from './api/places.contracts';
export * from './api/problem-details';
export * from './api/reviews.contracts';
export * from './api/rides.contracts';
export * from './api/search.contracts';
export * from './api/settings.contracts';
export * from './api/tracking.contracts';
export * from './api/vehicles.contracts';
export * from './content/help';
export * from './domain/fare';
export * from './domain/ride-status';
export * from './domain/roles';
export * from './domain/vehicle';
export * from './utils/money';
