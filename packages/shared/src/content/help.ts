/**
 * Help content — `docs/roadmap.md` M10b.
 *
 * A typed array in the repo rather than a table or a CMS. Nothing here
 * changes without a deploy, and that is the honest description of a dozen
 * answers about how the product works: they change when the product does,
 * which is when somebody is deploying anyway. A `help_articles` table would
 * be a migration, an admin screen and a permissions question, in exchange
 * for editing text without a pull request.
 *
 * When M9c adds MDX for blog and careers, this is the natural thing to
 * convert — the shape below is deliberately close to front matter, so that
 * conversion is a move rather than a rewrite.
 *
 * Every answer is written to be read by somebody who is mildly annoyed. No
 * greetings, no "simply", no reassurance — just the fact they came for.
 */

export interface HelpArticle {
  readonly slug: string;
  readonly question: string;
  readonly answer: string;
  /**
   * Extra words worth matching that the text does not contain.
   *
   * A rider searching "bkash" should find the payments answer even though
   * the product calls it a wallet. Search matches these as well as the
   * question and answer, which is the cheapest possible synonym handling
   * and enough at this size.
   */
  readonly keywords: readonly string[];
}

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'how-fares-are-calculated',
    question: 'How is my fare calculated?',
    answer:
      'Every fare is a base charge plus a rate per kilometre and a rate ' +
      'per minute, minus any discount. The distance and time come from the ' +
      'route we measure when you ask for a price — not from anything your ' +
      'phone reports — so the number you accept is the number you pay.',
    keywords: ['price', 'cost', 'charge', 'estimate', 'quote', 'taka'],
  },
  {
    slug: 'why-did-the-price-change',
    question: 'Why is the price different from last time?',
    answer:
      'Prices depend on the route, not the destination. A different pickup ' +
      'point, a longer way round, or heavier traffic all change the ' +
      'distance and time we measure. A price you have accepted never ' +
      'changes afterwards.',
    keywords: ['expensive', 'cheaper', 'different', 'higher', 'surge'],
  },
  {
    slug: 'payment-methods',
    question: 'How can I pay?',
    answer:
      'Cash to the driver, or a card or wallet held on your account. You ' +
      'choose when you book. Card and wallet payments are held when you ' +
      'book and taken when the ride finishes; cash is settled directly ' +
      'with your driver.',
    keywords: ['bkash', 'nagad', 'card', 'cash', 'wallet', 'visa'],
  },
  {
    slug: 'card-declined',
    question: 'My card was declined. What now?',
    answer:
      'The booking did not go through, and nothing was charged. Pick cash ' +
      'or another method and book again. If a card keeps failing, the ' +
      'reason is with your bank rather than with us.',
    keywords: ['declined', 'failed', 'rejected', 'payment', 'error'],
  },
  {
    slug: 'promo-codes',
    question: 'How do I use a promo code?',
    answer:
      'Enter it before you press "See prices". The discount is applied ' +
      'while the fare is calculated, so what you see is what you pay. If a ' +
      'code is refused we say why — expired, already used, or not valid ' +
      'for that journey.',
    keywords: ['promo', 'coupon', 'discount', 'offer', 'code', 'voucher'],
  },
  {
    slug: 'cancel-a-ride',
    question: 'Can I cancel a ride?',
    answer:
      'Yes, until the journey starts. Once you are moving the ride runs to ' +
      'completion. Cancelling releases any hold on your card.',
    keywords: ['cancel', 'stop', 'abort', 'refund'],
  },
  {
    slug: 'driver-not-arriving',
    question: 'My driver is not arriving.',
    answer:
      'The ride screen shows where they are while they are on the way. If ' +
      'they are not moving, cancel and book again — you will not be ' +
      'charged for a ride that never started.',
    keywords: ['late', 'waiting', 'stuck', 'tracking', 'location'],
  },
  {
    slug: 'become-a-driver',
    question: 'How do I drive with CholoJai?',
    answer:
      'Apply from the Drive section of your account. We check your ' +
      'licence and vehicle before approving you, and tell you either way. ' +
      'Approved drivers register a vehicle and can start accepting rides.',
    keywords: ['driver', 'apply', 'job', 'earn', 'work', 'signup'],
  },
  {
    slug: 'rate-a-driver',
    question: 'How do ratings work?',
    answer:
      'You can rate a driver once, after the ride finishes. Ratings are ' +
      'averaged across every ride a driver has completed. You cannot ' +
      'change a rating once it is left.',
    keywords: ['rating', 'review', 'stars', 'feedback', 'complain'],
  },
  {
    slug: 'change-my-password',
    question: 'How do I change my password?',
    answer:
      'From Settings. You will need your current password, and changing it ' +
      'signs you out everywhere — which is what locks out anyone else who ' +
      'is still signed in on a device you no longer have.',
    keywords: ['password', 'security', 'hacked', 'stolen', 'signout'],
  },
  {
    slug: 'turn-off-notifications',
    question: 'Can I stop some notifications?',
    answer:
      'Some of them, from Settings. Ride updates always arrive, because ' +
      'they are how you learn your driver has accepted or is outside. ' +
      'Everything else is yours to switch off.',
    keywords: ['notification', 'alert', 'mute', 'silence', 'email'],
  },
  {
    slug: 'contact-support',
    question: 'How do I contact a person?',
    answer:
      'Use the contact form. You do not need to be signed in — if you ' +
      'cannot get into your account, that is exactly when you need us ' +
      'most. Tell us what happened and where to reply.',
    keywords: ['support', 'help', 'contact', 'complaint', 'email', 'phone'],
  },
];
