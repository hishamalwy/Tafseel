import { describe, expect, it } from 'vitest';
import { DASHBOARDS, Dashboard } from './dashboard';

describe('Dashboard route model', () => {
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
});
