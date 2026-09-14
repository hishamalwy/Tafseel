// Extracts (1) Angular routes and (2) every API call the Angular client makes, from source.
// Usage: node inventory-client.mjs <repoRoot> <outDir>
import fs from 'node:fs';
import path from 'node:path';

const [root, out] = process.argv.slice(2);
const src = path.join(root, 'frontend-angular', 'src', 'app');
const rel = p => path.relative(root, p).replaceAll('\\', '/');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// ---------- routes ----------
const routesFile = path.join(src, 'app.routes.ts');
const rt = fs.readFileSync(routesFile, 'utf8');
const routes = [];
{
  // walk top-level objects inside the exported array
  const start = rt.indexOf('[', rt.indexOf('export const routes'));
  let depth = 0, objStart = -1;
  for (let i = start + 1; i < rt.length; i++) {
    const c = rt[i];
    if (c === '{') { if (depth === 0) objStart = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0) {
      const body = rt.slice(objStart, i + 1);
      const get = re => (body.match(re) || [])[1];
      routes.push({
        path: '/' + (get(/path:\s*'([^']*)'/) ?? ''),
        redirectTo: get(/redirectTo:\s*'([^']*)'/) ?? null,
        pathMatch: get(/pathMatch:\s*'([^']*)'/) ?? null,
        component: get(/\.then\(\s*m\s*=>\s*m\.(\w+)\)/) ?? null,
        module: get(/import\('([^']+)'\)/) ?? null,
        guards: (body.match(/canActivate:\s*\[([^\]]*)\]/) || [, ''])[1].split(',').map(s => s.trim()).filter(Boolean),
        data: get(/data:\s*(\{[^}]*\})/) ?? null,
        title: get(/title:\s*'([^']*)'/) ?? null,
        line: lineOf(rt, objStart),
      });
    } }
    else if (c === ']' && depth === 0) break;
  }
}
const hasWildcard = routes.some(r => r.path === '/**');

// ---------- API calls ----------
function readLiteral(text, i) {
  while (/\s/.test(text[i])) i++;
  const q = text[i];
  if (q === "'" || q === '"' || q === '`') {
    let j = i + 1;
    while (j < text.length && !(text[j] === q && text[j - 1] !== '\\')) j++;
    return { value: text.slice(i + 1, j), quote: q, end: j + 1 };
  }
  const m = text.slice(i).match(/^[\w.$]+/);
  return m ? { value: m[0], quote: null, end: i + m[0].length } : null;
}
function skipGenerics(text, i) {
  while (/\s/.test(text[i])) i++;
  if (text[i] !== '<') return i;
  let d = 0;
  for (; i < text.length; i++) {
    if (text[i] === '<') d++;
    else if (text[i] === '>' && text[i - 1] !== '=') { d--; if (d === 0) return i + 1; }
  }
  return i;
}
function normalize(url) {
  // template placeholders and query strings become a canonical shape
  let u = url.replace(/\$\{[^}]*\}/g, '{p}').split('?')[0];
  if (!u.startsWith('/api/')) u = '/api/v1' + (u.startsWith('/') ? u : '/' + u);
  return u.replace(/\/+$/, '');
}

const calls = [];
for (const file of walk(src)) {
  const text = fs.readFileSync(file, 'utf8');
  const consts = Object.fromEntries([...text.matchAll(/const\s+(\w+)\s*=\s*'([^']+)'/g)].map(m => [m[1], m[2]]));
  const isDashboardGateway = file.endsWith('dashboard.gateway.ts');
  for (const m of text.matchAll(/this\.(http|gateway)\s*\.\s*(get|post|put|patch|delete|upload)\b/g)) {
    if (isDashboardGateway) continue; // the gateway itself only prefixes /api/v1
    let i = skipGenerics(text, m.index + m[0].length);
    while (/\s/.test(text[i])) i++;
    if (text[i] !== '(') continue;
    const lit = readLiteral(text, i + 1);
    if (!lit) continue;
    let raw = lit.quote ? lit.value : (consts[lit.value] ?? `<${lit.value}>`);
    if (lit.quote === '`') raw = raw.replace(/\$\{(\w+)\}/g, (_, n) => consts[n] ?? '${' + n + '}');
    const method = m[2] === 'upload' ? 'POST' : m[2].toUpperCase();
    const viaDashboard = m[1] === 'gateway';
    calls.push({
      method,
      raw,
      route: raw.startsWith('<') ? null : normalize(viaDashboard ? '/api/v1' + raw : raw),
      file: rel(file),
      line: lineOf(text, m.index),
      via: viaDashboard ? 'DashboardGateway' : 'HttpClient',
    });
  }
}
// Dashboard tab sources are GETs issued through DashboardGateway.load
{
  const f = path.join(src, 'features', 'dashboards', 'models', 'dashboard.ts');
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/tab\('(\w+)',\s*'([^']*)',\s*\[([^\]]*)\]/g)) {
    for (const s of m[3].matchAll(/'([^']+)'/g)) {
      calls.push({ method: 'GET', raw: s[1], route: normalize('/api/v1' + s[1]), file: rel(f),
        line: lineOf(text, m.index), via: `Dashboard tab "${m[1]}"` });
    }
  }
  // the role -> area -> tab table, kept for the matrix
  const roles = [...text.matchAll(/(\w+):\s*\{\s*role:\s*'(\w+)'/g)].map(x => x[2]);
  fs.writeFileSync(path.join(out, 'dashboard-model-roles.json'), JSON.stringify(roles, null, 2));
}

fs.writeFileSync(path.join(out, 'angular-routes.json'), JSON.stringify({ hasWildcard, routes }, null, 2));
fs.writeFileSync(path.join(out, 'angular-api-calls.json'), JSON.stringify(calls, null, 2));
console.log(`routes=${routes.length} wildcard=${hasWildcard} apiCalls=${calls.length} unresolved=${calls.filter(c => !c.route).length}`);
