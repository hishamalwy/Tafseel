import { describe, expect, it } from 'vitest';
import { safeReturnUrl } from './auth.guards';

/**
 * The post-login destination is attacker-controllable, so this is a security
 * control rather than a convenience.
 */
describe('safeReturnUrl', () => {
  it('accepts ordinary in-app paths', () => {
    expect(safeReturnUrl('/student')).toBe('/student');
    expect(safeReturnUrl('/teacher/services')).toBe('/teacher/services');
    expect(safeReturnUrl('/browse?subject=math&page=2')).toBe('/browse?subject=math&page=2');
    expect(safeReturnUrl('/orders/123#invoice')).toBe('/orders/123#invoice');
  });

  it('accepts percent-encoded paths', () => {
    expect(safeReturnUrl('%2Fstudent%2Forders')).toBe('/student/orders');
  });

  it('rejects absolute URLs to other origins', () => {
    expect(safeReturnUrl('https://evil.example/steal')).toBeNull();
    expect(safeReturnUrl('HTTPS://EVIL.EXAMPLE')).toBeNull();
  });

  it('rejects protocol-relative and backslash host tricks', () => {
    expect(safeReturnUrl('//evil.example')).toBeNull();
    expect(safeReturnUrl('/\\evil.example')).toBeNull();
    expect(safeReturnUrl('\\\\evil.example')).toBeNull();
  });

  it('rejects non-http schemes', () => {
    expect(safeReturnUrl('javascript:alert(1)')).toBeNull();
    expect(safeReturnUrl('data:text/html,<script>')).toBeNull();
  });

  it('rejects a path that normalises to a host', () => {
    expect(safeReturnUrl('/foo//evil.example')).toBeNull();
  });

  it('rejects control characters used to smuggle a header break', () => {
    expect(safeReturnUrl('/\\evil.example')).toBeNull();
  });

  it('refuses to bounce back to the auth route', () => {
    expect(safeReturnUrl('/auth')).toBeNull();
    expect(safeReturnUrl('/auth/forgot')).toBeNull();
  });

  it('rejects relative and empty input', () => {
    expect(safeReturnUrl('student')).toBeNull();
    expect(safeReturnUrl('')).toBeNull();
    expect(safeReturnUrl(null)).toBeNull();
  });

  it('survives malformed percent-encoding instead of throwing', () => {
    expect(safeReturnUrl('%E0%A4%A')).toBeNull();
  });

  /** Regression: the original required a literal /app/ prefix and dropped everything else. */
  it('does not require an /app prefix', () => {
    expect(safeReturnUrl('/student/orders')).toBe('/student/orders');
  });
});
