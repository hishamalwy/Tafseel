import { Role } from '@core/auth/models/role';
import { DashboardRole } from '@features/dashboards/models/dashboard';

/** Finance staff see the Finance workspace; an Admin sees the same pages inside the Admin workspace. */
export function financeShellRole(roles: readonly Role[] | undefined): DashboardRole {
  return roles?.includes('Admin') ? 'Admin' : 'Finance';
}

/** One layout for every Finance page, built on the design system's tokens and table. */
export const FINANCE_STYLES = `
  :host { display: block; }
  .tf-fin { display: grid; gap: 20px; }
  .tf-fin-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .tf-fin-head h1 { margin: 0; font-size: var(--type-page-title-size); line-height: var(--type-page-title-line); letter-spacing: var(--type-page-title-tracking); font-weight: var(--weight-heavy); }
  .tf-fin-head p { margin: 6px 0 0; color: var(--text-2); font-size: var(--type-body-sm-size); line-height: 1.6; max-width: 70ch; }
  .tf-fin-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
  .tf-fin-toolbar .tf-field { display: grid; gap: 6px; min-width: 200px; flex: 1 1 220px; }
  .tf-fin-toolbar .tf-field--narrow { flex: 0 1 200px; }
  .tf-fin-segments { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface-2); justify-self: start; max-inline-size: 100%; overflow-x: auto; }
  .tf-fin-segments button { flex: 0 0 auto; min-height: 44px; padding: 6px 14px; border: 0; border-radius: calc(var(--r-md) - 3px);
    background: transparent; color: var(--text-2); font: inherit; font-size: var(--type-body-sm-size); font-weight: 600; cursor: pointer; white-space: nowrap; }
  .tf-fin-segments button[aria-pressed='true'] { background: var(--surface); color: var(--text); font-weight: 700;
    box-shadow: 0 1px 2px color-mix(in oklab, var(--text) 10%, transparent), 0 0 0 1px var(--border); }
  .tf-fin-card { display: grid; gap: 10px; padding: 18px 20px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
  .tf-fin-card h2 { margin: 0; font-size: var(--type-item-title-size); font-weight: 800; }
  .tf-fin-card h3 { margin: 0; font-size: var(--type-body-sm-size); font-weight: 750; color: var(--text-2); }
  .tf-fin-muted { margin: 0; color: var(--text-2); font-size: var(--type-label-size); line-height: 1.6; }
  .tf-fin-kv { display: grid; grid-template-columns: minmax(140px, max-content) 1fr; gap: 6px 16px; margin: 0; font-size: var(--type-body-sm-size); }
  .tf-fin-kv dt { color: var(--text-2); }
  .tf-fin-kv dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  .tf-fin-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: var(--type-label-size); direction: ltr; unicode-bidi: isolate; }
  .tf-fin-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .tf-fin-actions .tf-button { min-height: 44px; }
  .tf-fin-row-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
  .tf-fin-row-actions .tf-button { min-height: 44px; }
  .tf-fin-empty { margin: 0; padding: 28px 20px; border: 1px dashed var(--border-strong); border-radius: var(--r-lg);
    color: var(--text-2); text-align: center; font-size: var(--type-body-sm-size); }
  .tf-fin-pager { display: flex; align-items: center; justify-content: center; gap: 12px; }
  .tf-fin-pager .tf-button { min-height: 44px; }
  .tf-fin-panel { display: grid; gap: 12px; padding: 16px 18px; border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--border));
    border-radius: var(--r-lg); background: color-mix(in oklab, var(--primary-soft) 40%, var(--surface)); }
  .tf-fin-panel form { display: grid; gap: 12px; }
  .tf-fin-panel .tf-field { display: grid; gap: 6px; }
  .tf-fin-panel label.tf-fin-check { display: flex; gap: 10px; align-items: flex-start; min-height: 44px; font-size: var(--type-body-sm-size); line-height: 1.5; }
  .tf-fin-panel label.tf-fin-check input { margin-block-start: 3px; inline-size: 18px; block-size: 18px; flex: none; }
  .tf-table td .tf-badge { white-space: nowrap; }
  .tf-table a { font-weight: 700; }
  @media (max-width: 720px) { .tf-fin-kv { grid-template-columns: 1fr; } .tf-fin-kv dd { margin-block-end: 6px; } }
`;
