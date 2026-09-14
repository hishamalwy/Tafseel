import { describe, expect, it } from 'vitest';
import { EmailAddress } from './email-address';
import { PasswordPolicy } from './password-policy';

/**
 * Shared value objects: no TestBed, no HTTP, no browser. That is the point of
 * keeping them out of a component.
 */

describe('EmailAddress', () => {
  it('accepts an ordinary address and trims it', () => {
    expect(EmailAddress.create('  noor@example.com ')?.value).toBe('noor@example.com');
  });

  it('rejects addresses without a domain part', () => {
    expect(EmailAddress.create('noor@')).toBeNull();
    expect(EmailAddress.create('noor')).toBeNull();
    expect(EmailAddress.create('noor@example')).toBeNull();
  });

  it('rejects whitespace inside the address', () => {
    expect(EmailAddress.create('no or@example.com')).toBeNull();
  });

  it('rejects an address longer than the column allows', () => {
    expect(EmailAddress.create('a'.repeat(250) + '@example.com')).toBeNull();
  });

  it('returns null rather than throwing, because bad input is expected', () => {
    expect(() => EmailAddress.create('')).not.toThrow();
    expect(EmailAddress.create('')).toBeNull();
  });
});

describe('PasswordPolicy', () => {
  it('requires all five rules', () => {
    expect(PasswordPolicy.isSatisfiedBy('Str0ng!Pass')).toBe(true);
    expect(PasswordPolicy.isSatisfiedBy('short1!A')).toBe(false);        // too short
    expect(PasswordPolicy.isSatisfiedBy('alllowercase1!')).toBe(false);  // no upper
    expect(PasswordPolicy.isSatisfiedBy('ALLUPPERCASE1!')).toBe(false);  // no lower
    expect(PasswordPolicy.isSatisfiedBy('NoDigitsHere!')).toBe(false);   // no digit
    expect(PasswordPolicy.isSatisfiedBy('NoSymbols1234')).toBe(false);   // no symbol
  });

  it('rejects a password past the server maximum', () => {
    expect(PasswordPolicy.isSatisfiedBy('A1!' + 'a'.repeat(130))).toBe(false);
  });

  it('reports each rule separately so the form can show progress', () => {
    const byId = Object.fromEntries(
      PasswordPolicy.evaluate('abcdefghij').map(r => [r.id, r.satisfied]));
    expect(byId['length']).toBe(true);
    expect(byId['lower']).toBe(true);
    expect(byId['upper']).toBe(false);
    expect(byId['digit']).toBe(false);
    expect(byId['special']).toBe(false);
  });
});
