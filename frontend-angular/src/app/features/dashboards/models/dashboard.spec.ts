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
});
