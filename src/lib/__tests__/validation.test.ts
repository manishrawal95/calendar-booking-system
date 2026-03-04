import { describe, it, expect } from 'vitest';
import { isValidName, isValidEmail, isValidAgenda, isValidLinkedinUrl } from '../validation';

describe('isValidName', () => {
  it('accepts normal names', () => {
    expect(isValidName('John Doe')).toBe(true);
    expect(isValidName('Jane')).toBe(true);
  });

  it('rejects too short', () => {
    expect(isValidName('A')).toBe(false);
  });

  it('rejects gibberish (repeating chars)', () => {
    expect(isValidName('aaa')).toBe(false);
    expect(isValidName('111')).toBe(false);
  });

  it('rejects no letters', () => {
    expect(isValidName('123')).toBe(false);
  });

  it('trims whitespace', () => {
    expect(isValidName('  Jo  ')).toBe(true);
  });
});

describe('isValidEmail', () => {
  it('accepts valid work email for job-seeker', () => {
    const result = isValidEmail('john@company.com', 'job-seeker');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(isValidEmail('notanemail', 'job-seeker').valid).toBe(false);
    expect(isValidEmail('a@b', 'job-seeker').valid).toBe(false);
  });

  it('rejects disposable email', () => {
    const result = isValidEmail('test@mailinator.com', 'job-seeker');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Disposable');
  });

  it('rejects free email for networking', () => {
    const result = isValidEmail('test@gmail.com', 'networking');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('work email');
  });

  it('allows free email for job-seeker', () => {
    const result = isValidEmail('test@gmail.com', 'job-seeker');
    expect(result.valid).toBe(true);
  });

  it('rejects short local part', () => {
    expect(isValidEmail('ab@company.com', 'job-seeker').valid).toBe(false);
  });

  it('rejects numeric-only local part', () => {
    expect(isValidEmail('123@company.com', 'job-seeker').valid).toBe(false);
  });
});

describe('isValidAgenda', () => {
  it('accepts meaningful agenda', () => {
    expect(isValidAgenda('I want to discuss career transition options')).toBe(true);
  });

  it('rejects too short', () => {
    expect(isValidAgenda('hi')).toBe(false);
  });

  it('rejects repetitive words', () => {
    expect(isValidAgenda('test test test test')).toBe(false);
  });

  it('rejects no letters', () => {
    expect(isValidAgenda('123 456 789 000')).toBe(false);
  });
});

describe('isValidLinkedinUrl', () => {
  it('accepts valid LinkedIn URLs', () => {
    expect(isValidLinkedinUrl('https://linkedin.com/in/johndoe')).toBe(true);
    expect(isValidLinkedinUrl('https://www.linkedin.com/in/johndoe')).toBe(true);
    expect(isValidLinkedinUrl('http://linkedin.com/in/johndoe')).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(isValidLinkedinUrl('https://twitter.com/johndoe')).toBe(false);
    expect(isValidLinkedinUrl('https://linkedin.com/company/acme')).toBe(false);
    expect(isValidLinkedinUrl('')).toBe(false);
    expect(isValidLinkedinUrl('not a url')).toBe(false);
  });
});
