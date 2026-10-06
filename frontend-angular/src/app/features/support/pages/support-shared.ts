/** One layout for the help pages, on the design system's tokens. */
export const SUPPORT_STYLES = `
  :host { display: block; }
  .tf-help { display: grid; gap: 20px; max-width: 860px; }
  .tf-help-head h1 { margin: 0; font-size: var(--type-page-title-size); line-height: var(--type-page-title-line); letter-spacing: var(--type-page-title-tracking); font-weight: var(--weight-heavy); }
  .tf-help-head p { margin: 6px 0 0; color: var(--text-2); font-size: var(--type-body-size); line-height: 1.6; max-width: 65ch; }
  .tf-help-card { display: grid; gap: 12px; padding: 18px 20px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
  .tf-help-card h2 { margin: 0; font-size: var(--type-item-title-size); font-weight: 800; }
  .tf-help-note { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-radius: var(--r-lg); background: var(--surface-2); font-size: var(--type-body-sm-size); line-height: 1.6; }
  .tf-help-note a { font-weight: 700; min-height: 44px; display: inline-flex; align-items: center; }
  .tf-help-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin: 0; padding: 0; border: 0; }
  .tf-help-choice { display: grid; gap: 4px; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface); cursor: pointer; min-height: 44px; transition: border-color var(--motion-fast) ease; }
  @media (hover:hover) and (pointer:fine) { .tf-help-choice:hover { border-color: var(--border-strong); } }
  .tf-help-choice:has(input:checked) { border-color: var(--primary); background: color-mix(in oklab, var(--primary-soft) 55%, var(--surface)); }
  .tf-help-choice input { position: absolute; opacity: 0; pointer-events: none; }
  .tf-help-choice:has(input:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; }
  .tf-help-choice strong { font-size: var(--type-body-size); }
  .tf-help-choice span { color: var(--text-2); font-size: var(--type-label-size); line-height: 1.5; }
  .tf-help-form { display: grid; gap: 12px; }
  .tf-help-form .tf-field { display: grid; gap: 6px; }
  .tf-help-form textarea { min-height: 140px; }
  .tf-help-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .tf-help-actions .tf-button { min-height: 44px; }
  .tf-help-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); overflow: hidden; }
  .tf-help-list li { border-block-start: 1px solid var(--border); }
  .tf-help-list li:first-child { border-block-start: 0; }
  .tf-help-list a { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 14px 18px; color: inherit; text-decoration: none; }
  @media (hover:hover) and (pointer:fine) { .tf-help-list a:hover { background: color-mix(in oklab, var(--surface-2) 60%, transparent); } }
  .tf-help-list strong { font-size: var(--type-body-size); }
  .tf-help-list small { grid-column: 1 / -1; color: var(--text-2); font-size: var(--type-label-size); }
  .tf-help-ref { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; direction: ltr; unicode-bidi: isolate; font-size: var(--type-label-size); }
  .tf-help-thread { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .tf-help-thread li { display: grid; gap: 4px; padding: 12px 14px; border-radius: var(--r-md); background: var(--surface-2); max-width: 85%; }
  .tf-help-thread li[data-mine='true'] { margin-inline-start: auto; background: var(--primary-soft); }
  .tf-help-thread li[data-staff='true'] { border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--border)); }
  .tf-help-thread strong { font-size: var(--type-label-size); }
  .tf-help-thread p { margin: 0; white-space: pre-line; font-size: var(--type-body-sm-size); line-height: 1.6; }
  .tf-help-thread time { color: var(--text-2); font-size: var(--type-meta-size); }
  .tf-help-outcome { padding: 14px 18px; border-radius: var(--r-lg); background: var(--success-soft); color: var(--text); }
  .tf-help-outcome strong { display: block; margin-block-end: 4px; color: var(--success); }
  .tf-help-files { display: flex; flex-wrap: wrap; gap: 8px; }
  .tf-help-files .tf-button { min-height: 44px; }
  .tf-help-kv { display: grid; grid-template-columns: minmax(120px, max-content) 1fr; gap: 6px 16px; margin: 0; font-size: var(--type-body-sm-size); }
  .tf-help-kv dt { color: var(--text-2); }
  .tf-help-kv dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  .tf-help-received { margin: 0; padding: 12px 16px; border-radius: var(--r-md); background: var(--success-soft); color: var(--success); font-weight: 600; }
  @media (max-width: 720px) { .tf-help-kv { grid-template-columns: 1fr; } .tf-help-thread li { max-width: 100%; } }
  @media (prefers-reduced-motion: reduce) { .tf-help-choice { transition: none; } }
`;
