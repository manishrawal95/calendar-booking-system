export type BookingType = 'job-seeker' | 'networking';

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || !/[a-zA-Z]/.test(trimmed)) return false;
  const normalized = trimmed.toLowerCase();
  const uniqueChars = new Set(normalized.replace(/\s/g, '').split(''));
  if (uniqueChars.size < 2) return false;
  return true;
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
