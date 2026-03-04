import disposableDomains from 'disposable-email-domains';
import freeEmailDomains from 'free-email-domains';

export type BookingType = 'job-seeker' | 'networking';

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || !/[a-zA-Z]/.test(trimmed)) return false;
  const normalized = trimmed.toLowerCase();
  const uniqueChars = new Set(normalized.replace(/\s/g, '').split(''));
  if (uniqueChars.size < 2) return false;
  return true;
}

export function isValidEmail(email: string, type: BookingType): { valid: boolean; reason?: string } {
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

export function isValidAgenda(agenda: string): boolean {
  const trimmed = agenda.trim();
  if (trimmed.length < 10 || !/[a-zA-Z]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  const uniqueWords = new Set(words);
  if (uniqueWords.size < 3) return false;
  return true;
}

export function isValidLinkedinUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return /^https?:\/\/(www\.)?linkedin\.com\/in\/.+/i.test(trimmed);
}
