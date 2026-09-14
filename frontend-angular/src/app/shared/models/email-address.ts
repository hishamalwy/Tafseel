/**
 * An email address that has been checked for shape.
 *
 * A value object rather than a bare string so "this was validated" is carried by
 * the type: a use case that takes `EmailAddress` cannot be handed raw input.
 */
export class EmailAddress {
  private static readonly PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private static readonly MAX_LENGTH = 256;

  private constructor(readonly value: string) {}

  static isValid(raw: string): boolean {
    const trimmed = raw.trim();
    return trimmed.length > 0
      && trimmed.length <= EmailAddress.MAX_LENGTH
      && EmailAddress.PATTERN.test(trimmed);
  }

  /** Returns null rather than throwing: invalid input is expected, not exceptional. */
  static create(raw: string): EmailAddress | null {
    const trimmed = raw.trim();
    return EmailAddress.isValid(trimmed) ? new EmailAddress(trimmed) : null;
  }

  toString(): string {
    return this.value;
  }
}
