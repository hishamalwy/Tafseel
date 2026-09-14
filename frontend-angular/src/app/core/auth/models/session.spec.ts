import { describe, expect, it } from 'vitest';
import { Session } from './session';
import { primaryRole } from './role';

describe('role precedence', () => {
  it('picks the most privileged role a user holds', () => {
    expect(primaryRole(['Student', 'Admin'])).toBe('Admin');
    expect(primaryRole(['Teacher', 'Student'])).toBe('Teacher');
    expect(primaryRole(['QualityReviewer', 'Teacher'])).toBe('QualityReviewer');
    expect(primaryRole(['Student'])).toBe('Student');
  });

  it('has no answer for a user with no known role', () => {
    expect(primaryRole([])).toBeNull();
  });
});

describe('Session', () => {
  const session: Session = {
    userId: 'u1', email: 'a@b.co', fullName: 'A', fullNameEnglish: 'A',
    roles: ['Teacher'], hasAvatar: false, mfaEnabled: false,
    accessToken: 't', accessTokenExpiresAt: '2030-01-01T00:00:00Z'
  };

  it('answers role questions without a null check at every call site', () => {
    expect(Session.has(session, 'Teacher')).toBe(true);
    expect(Session.has(session, 'Admin')).toBe(false);
    expect(Session.has(session, 'Admin', 'Teacher')).toBe(true);
    expect(Session.has(null, 'Teacher')).toBe(false);
  });

  it('names the role that decides the home surface', () => {
    expect(Session.primary(session)).toBe('Teacher');
    expect(Session.primary(null)).toBeNull();
  });
});
