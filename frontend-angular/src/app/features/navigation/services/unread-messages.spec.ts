import { unreadTotal } from './unread-messages';

describe('unreadTotal (UX-71)', () => {
  it('adds the unread messages of every conversation read, and ignores junk', () => {
    expect(unreadTotal({ items: [{ unreadCount: 2 }, { unreadCount: 0 }, { unreadCount: 3 }] })).toBe(5);
    expect(unreadTotal({ items: [{ unreadCount: -1 }, { unreadCount: 'x' }, {}] })).toBe(0);
    expect(unreadTotal(null)).toBe(0);
  });
});
