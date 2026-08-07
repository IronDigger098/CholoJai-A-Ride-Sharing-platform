import { type EmailMessage } from '../../common/mail/mailer.port';

/**
 * Email bodies for the authentication flows.
 *
 * Plain functions returning data, deliberately: they are trivially testable
 * ("does the link contain the token?"), and a template engine would be
 * three dependencies and a build step for four emails. When the marketing
 * team wants designed HTML in M9, this file is the single place it changes.
 *
 * Every message ships a `text` body. Some clients render nothing else, some
 * users disable HTML, and a verification link that only exists inside a
 * `<a>` tag is a link some people can never click.
 */

interface VerificationEmailInput {
  readonly fullName: string;
  readonly verifyUrl: string;
  readonly expiresInHours: number;
}

export function buildVerificationEmail(
  to: string,
  input: VerificationEmailInput,
): EmailMessage {
  const { fullName, verifyUrl, expiresInHours } = input;

  return {
    to,
    subject: 'Verify your CholoJai email address',
    text: [
      `Hi ${fullName},`,
      '',
      'Confirm your email address to finish setting up your CholoJai account:',
      '',
      verifyUrl,
      '',
      `This link expires in ${expiresInHours} hours and can be used once.`,
      '',
      "If you didn't create a CholoJai account, you can ignore this email —",
      'no account will be activated without confirming this link.',
      '',
      '— CholoJai',
    ].join('\n'),
    html: [
      '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;line-height:1.6">',
      `  <p>Hi ${escapeHtml(fullName)},</p>`,
      '  <p>Confirm your email address to finish setting up your CholoJai account.</p>',
      `  <p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px">Verify email address</a></p>`,
      `  <p style="color:#666;font-size:14px">This link expires in ${expiresInHours} hours and can be used once.</p>`,
      '  <p style="color:#666;font-size:14px">If you didn\'t create a CholoJai account, you can ignore this email — no account will be activated without confirming this link.</p>',
      '</div>',
    ].join('\n'),
  };
}

/**
 * Escape user-supplied text before it enters HTML.
 *
 * `fullName` comes from a registration form, so it is attacker-controlled.
 * Interpolating it raw would let someone register as
 * `<img src=x onerror=...>` and have that markup render in an inbox —
 * cross-site scripting that arrives by email. Email clients vary in what
 * they execute; none of them should be handed the opportunity.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
