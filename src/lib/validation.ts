import disposableDomains from 'disposable-email-domains';
import freeEmailDomains from 'free-email-domains';

export { isValidName, isValidAgenda, isValidLinkedinUrl } from './validation-client';
export type { BookingType } from './validation-client';

export function isValidEmail(email: string, type: import('./validation-client').BookingType): { valid: boolean; reason?: string } {
  const trimmed = email.trim().toLowerCase();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(trimmed)) return { valid: false, reason: 'Invalid email format' };

  const [localPart, domain] = trimmed.split('@');
  if (!localPart || !domain) return { valid: false, reason: 'Invalid email format' };

  if (disposableDomains.includes(domain)) {
    return { valid: false, reason: 'Disposable email addresses are not allowed' };
  }

  if (type === 'networking' && freeEmailDomains.includes(domain)) {
    return { valid: false, reason: 'Peer networking requires a work email address' };
  }

  if (localPart.length < 3 || domain.length < 5) return { valid: false, reason: 'Invalid email format' };
  if (!/[a-zA-Z]/.test(localPart)) return { valid: false, reason: 'Invalid email format' };

  return { valid: true };
}
