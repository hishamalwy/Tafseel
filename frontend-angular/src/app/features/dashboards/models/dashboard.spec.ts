import { describe, expect, it } from 'vitest';
import { ADMIN_ACTIVE_TOGGLES, DASHBOARDS, Dashboard } from './dashboard';

describe('Dashboard route model', () => {
  it('opens each work item on its own screen rather than acting on it inside the list', () => {
    expect(Dashboard.detailLink({ _source: '/orders/mine?page=1', id: 'o1' })).toEqual(['/orders', 'o1']);
    expect(Dashboard.detailLink({ _source: '/orders/assigned', id: 'o1' })).toEqual(['/orders', 'o1']);
    expect(Dashboard.detailLink({ _source: '/live-sessions/mine', id: 'b1' })).toEqual(['/live-sessions', 'b1']);
    expect(Dashboard.detailLink({ _source: '/learning-requests/assigned', id: 'r1' })).toEqual(['/requests', 'r1']);
    expect(Dashboard.detailLink({ _source: '/open-marketplace/opportunities', id: 'r2' })).toEqual(['/teacher/opportunities', 'r2']);
    expect(Dashboard.detailLink({ _source: '/conversations', id: 'c1' })).toEqual(['/conversations', 'c1']);
    expect(Dashboard.detailLink({ _source: '/admin/users', id: 'u1' })).toBeNull();
    expect(Dashboard.detailLink({ _source: '/orders/mine' })).toBeNull();
  });

  it('falls unknown sections and tabs back to the first usable destination', () => {
    const config = DASHBOARDS.Admin;
    const area = Dashboard.area(config, 'does-not-exist');
    expect(area.key).toBe('home');
    expect(Dashboard.tab(area, 'missing').key).toBe('home');
  });

  it('normalizes arrays, pages and single summaries without inventing demo rows', () => {
    expect(Dashboard.rows([{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(Dashboard.rows({ items: [{ id: 'b' }], totalCount: 1 })).toEqual([{ id: 'b' }]);
    expect(Dashboard.rows({ active: 3 })).toEqual([{ active: 3 }]);
    expect(Dashboard.rows(null)).toEqual([]);
  });

  it('keeps every configured tab backed by a route area', () => {
    for (const config of Object.values(DASHBOARDS)) {
      expect(config.areas.length).toBeGreaterThan(0);
      for (const area of config.areas) expect(area.tabs.length).toBeGreaterThan(0);
    }
  });

  it('follows only notification links that stay on this site, inside the reader’s locale', () => {
    expect(Dashboard.notificationAction('/orders/o1')).toEqual({ kind: 'route', path: '/orders/o1', query: {} });
    expect(Dashboard.notificationAction('/en/requests/r1/offers?x=1')).toEqual({ kind: 'route', path: '/requests/r1/offers', query: { x: '1' } });
    expect(Dashboard.notificationAction('/ar')).toEqual({ kind: 'route', path: '/', query: {} });
    expect(Dashboard.notificationAction('/arabic')).toEqual({ kind: 'route', path: '/arabic', query: {} });
    expect(Dashboard.notificationAction('/app/Tafseel-Disputes.dc.html?id=d1')).toEqual({ kind: 'legacy', href: 'app/Tafseel-Disputes.dc.html?id=d1' });
    for (const hostile of [
      'https://evil.example/orders', '//evil.example/orders', '/\\evil.example', 'javascript:alert(1)', 'orders/o1',
      '/api/v1/orders/o1', '/hubs/chat', '/health', '/app/../api/v1/x', '/orders\u0000', '/ord\ners','', null, 42
    ]) expect(Dashboard.notificationAction(hostile), String(hostile)).toBeNull();
  });

  it('reads the focused item from whichever id a link carried', () => {
    const query = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
    expect(Dashboard.focusId(query({ tab: 'orders', orderId: 'o1' }))).toBe('o1');
    expect(Dashboard.focusId(query({ sessionId: 's1' }))).toBe('s1');
    expect(Dashboard.focusId(query({ tab: 'orders' }))).toBe('');
  });

  describe('admin active toggles (J13-02)', () => {
    const id = '3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f';
    it.each([
      ['services', '/admin/catalog/services', `/admin/catalog/services/${id}/active`],
      ['subjects', '/admin/catalog/subjects', `/admin/catalog/subjects/${id}/active`],
      ['topics', '/admin/catalog/topics', `/admin/catalog/topics/${id}/active`],
      ['educationLevels', '/admin/catalog/education-levels', `/admin/catalog/education-levels/${id}/active`],
      ['assignments', '/admin/catalog/qualification-topics', `/admin/catalog/qualification-topics/${id}/active`],
      ['promotions', '/admin/promotions', `/admin/promotions/${id}/active`],
      ['coupons', '/admin/coupons', `/admin/coupons/${id}/active`]
    ])('%s toggles through %s', (tab, source, endpoint) => {
      expect(Dashboard.activeToggle(tab, { id, _source: source })).toBe(endpoint);
    });

    it('covers exactly the admin tabs that list toggleable rows, from a source the tab really loads', () => {
      const adminTabs = DASHBOARDS.Admin.areas.flatMap(area => area.tabs);
      for (const [key, toggle] of Object.entries(ADMIN_ACTIVE_TOGGLES)) {
        const tab = adminTabs.find(t => t.key === key);
        expect(tab, key).toBeDefined();
        expect(tab!.sources.map(s => s.split('?')[0]), key).toContain(toggle.listSource);
      }
      expect(Object.keys(ADMIN_ACTIVE_TOGGLES).sort()).toEqual(
        ['assignments', 'coupons', 'educationLevels', 'promotions', 'services', 'subjects', 'topics']);
    });

    it('offers no toggle for a row the tab lists from another source, a row without an id, or a tab without toggles', () => {
      expect(Dashboard.activeToggle('topics', { id, _source: '/admin/catalog/subjects' })).toBeNull();
      expect(Dashboard.activeToggle('assignments', { id, _source: '/admin/catalog/subjects' })).toBeNull();
      expect(Dashboard.activeToggle('services', { _source: '/admin/catalog/services' })).toBeNull();
      expect(Dashboard.activeToggle('users', { id, _source: '/admin/users?page=1' })).toBeNull();
    });

    it('never uses a UI tab name as an API slug', () => {
      for (const toggle of Object.values(ADMIN_ACTIVE_TOGGLES)) {
        expect(toggle.endpoint(id)).not.toMatch(/educationLevels|assignments/);
      }
    });
  });
});
