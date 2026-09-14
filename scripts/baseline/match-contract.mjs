// Matches every Angular API call against the live endpoint table dumped from the host.
// Usage: node match-contract.mjs <invDir>
import fs from 'node:fs';
import path from 'node:path';

const inv = process.argv[2];
const endpoints = JSON.parse(fs.readFileSync(path.join(inv, 'endpoints.json'), 'utf8'));
const captured = JSON.parse(fs.readFileSync(path.join(inv, 'angular-api-calls.json'), 'utf8'));

// Calls whose URL is computed at runtime; resolved by reading the call sites.
const dynamic = [
  ['POST', '/api/v1/payments/orders/{p}', 'features/checkout/models/payable.ts:115'],
  ['POST', '/api/v1/payments/live-sessions/{p}', 'features/checkout/models/payable.ts:116'],
  ['POST', '/api/v1/orders/{p}/deliveries', 'features/dashboards/pages/dashboard-page.component.ts:197'],
  ['POST', '/api/v1/live-sessions/{p}/attachments', 'features/dashboards/pages/dashboard-page.component.ts:206'],
  ['GET', '/api/v1/orders/deliveries/{p}/content', 'features/dashboards/pages/dashboard-page.component.ts:181'],
  ['GET', '/api/v1/live-sessions/attachments/{p}/content', 'features/dashboards/pages/dashboard-page.component.ts:185'],
  ['GET', '/api/v1/auth/privacy/export', 'features/dashboards/pages/dashboard-page.component.ts:210'],
  ['GET', '/api/v1/users/{p}/avatar', 'core/i18n/format.service.ts:96'],
  ['GET', '/api/v1/teachers/samples/{p}/content', 'features/teachers/services/http-teacher.gateway.ts:102'],
  ['GET', '/api/v1/education-levels', 'features/teachers/services/http-teacher.gateway.ts:241'],
  ['GET', '/api/v1/live-sessions/{p}/join', 'features/dashboards/pages/dashboard-page.component.ts:146'],
  ['GET', '/api/v1/qualification-resources/{p}/content', 'features/teach/pages/teacher-apply-page.component.ts:177'],
  ...['promotions', 'coupons'].map(t => ['PUT', `/api/v1/admin/${t}/{p}/active`, 'features/dashboards/pages/dashboard-page.component.ts:173']),
  ...['services', 'subjects', 'topics', 'educationLevels', 'assignments']
    .map(t => ['PUT', `/api/v1/admin/catalog/${t}/{p}/active`, 'features/dashboards/pages/dashboard-page.component.ts:175']),
].map(([method, route, at]) => ({ method, route, file: 'frontend-angular/src/app/' + at.split(':')[0], line: +at.split(':')[1], via: 'resolved dynamic path' }));

const calls = [...captured.filter(c => c.route && !c.route.startsWith('/api/v1/locale/')), ...dynamic];

const seg = r => r.replace(/^\//, '').split('/');
const isParam = s => /^\{.*\}$/.test(s);
function score(clientRoute, serverRoute) {
  const a = seg(clientRoute), b = seg(serverRoute);
  if (a.length !== b.length) return -1;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    if (isParam(b[i])) { s += isParam(a[i]) ? 2 : 1; continue; } // literal client segment can bind a param
    if (isParam(a[i])) return -1;
    if (a[i].toLowerCase() !== b[i].toLowerCase()) return -1;
    s += 3;
  }
  return s;
}

const rows = [];
const seen = new Set();
for (const c of calls) {
  const key = `${c.method} ${c.route}`;
  if (seen.has(key)) { rows.find(r => r.key === key).sites.push(`${c.file}:${c.line}`); continue; }
  seen.add(key);
  const candidates = endpoints
    .map(e => ({ e, s: score(c.route, e.route) }))
    .filter(x => x.s >= 0)
    .sort((x, y) => y.s - x.s);
  const exactPath = candidates.filter(x => x.s === Math.max(...candidates.map(y => y.s)));
  const verbMatch = exactPath.find(x => x.e.methods.includes(c.method));
  let status, server = null, note = '';
  if (verbMatch) {
    server = verbMatch.e;
    // A literal client segment bound to a server parameter is fine when the parameter is a
    // documented discriminator (admin/catalog/{type}); it is a defect when it swallows a word
    // the client meant as a path (teachers/{teacherId} receiving "availability").
    const discriminators = new Set(['{type}']);
    const bound = seg(c.route).map((s, i) => [s, seg(server.route)[i]])
      .filter(([s, p]) => !isParam(s) && isParam(p));
    const literalBoundToParam = bound.some(([, p]) => !discriminators.has(p));
    status = literalBoundToParam ? 'SHADOWED' : 'OK';
    if (literalBoundToParam) note = `literal segment binds a route parameter of ${server.route}`;
  } else if (exactPath.length) {
    status = 'WRONG_VERB';
    server = exactPath[0].e;
    note = `path exists only as ${[...new Set(exactPath.flatMap(x => x.e.methods))].join('/')}`;
  } else {
    status = 'NO_ROUTE';
  }
  if (server?.kind === 'minimal' && server.route.includes('{**')) { status = 'FALLBACK_ONLY'; note = 'only the SPA fallback matches'; }
  rows.push({ key, method: c.method, route: c.route, status, server: server && `${server.methods.join('/')} ${server.route}`,
    action: server && server.controller ? `${server.controller}.${server.action}` : null, note, sites: [`${c.file}:${c.line}`] });
}

// Server endpoints with no Angular caller
const api = endpoints.filter(e => e.route.startsWith('/api/'));
const called = new Set(rows.filter(r => r.status === 'OK').map(r => r.server));
const uncalled = api.filter(e => !called.has(`${e.methods.join('/')} ${e.route}`))
  .map(e => ({ route: e.route, methods: e.methods, action: `${e.controller}.${e.action}`,
    access: e.anonymous ? 'anonymous' : [...e.roles, ...e.policies].join(' | ') || (e.authenticated ? 'authenticated' : 'none') }));

fs.writeFileSync(path.join(inv, 'contract-match.json'), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(inv, 'endpoints-without-client.json'), JSON.stringify(uncalled, null, 2));
const by = s => rows.filter(r => r.status === s).length;
console.log(`client call shapes=${rows.length} OK=${by('OK')} WRONG_VERB=${by('WRONG_VERB')} NO_ROUTE=${by('NO_ROUTE')} SHADOWED=${by('SHADOWED')} FALLBACK_ONLY=${by('FALLBACK_ONLY')}`);
console.log(`api endpoints=${api.length} called-by-angular=${api.length - uncalled.length} no-angular-caller=${uncalled.length}`);
for (const r of rows.filter(r => r.status !== 'OK')) console.log(r.status.padEnd(13), r.method.padEnd(6), r.route.padEnd(52), r.note || '', '|', r.sites[0]);
