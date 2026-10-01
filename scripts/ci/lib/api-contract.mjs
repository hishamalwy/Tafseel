// Client/server API contract matching for the Angular client.
//
// Server side: tests/contracts/api-endpoints.json, generated from the running host by
// ApiContractSnapshotTests. Client side: every API call found in frontend-angular/src/app, plus
// the calls whose URL is computed at runtime, declared in tests/contracts/dynamic-client-calls.json.
//
// Violation kinds:
//   NO_ROUTE              no endpoint has this path shape
//   WRONG_VERB            the path exists, but not for this HTTP method
//   SHADOWED              a literal client segment is swallowed by a server route parameter
//   BODY_MISSING_REQUIRED the client does not send a field the server requires
//   BODY_UNKNOWN_FIELD    the client sends a field the server does not bind (silently dropped)
//   BODY_NOT_ACCEPTED     the client sends a JSON body to an action that binds none
//   UNRESOLVED_CALL       a call with a computed URL that is not declared as a dynamic call
import fs from 'node:fs';
import path from 'node:path';

const HTTP_CALL = /this\.(http|gateway)\s*\.\s*(get|post|put|patch|delete|upload)\b/g;
// Route parameters that deliberately take a word from the path.
const DISCRIMINATORS = new Set(['{type}', '{kind:regex(^certifications|experience$)}']);

export function loadContract(root) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  return {
    endpoints: read('tests/contracts/api-endpoints.json').endpoints,
    dynamic: read('tests/contracts/dynamic-client-calls.json'),
    known: read('tests/contracts/api-contract-known-violations.json'),
  };
}

// ------------------------------------------------------------------ client extraction

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) found.push(full);
  }
  return found;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function skipSpace(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

function skipGenerics(text, i) {
  i = skipSpace(text, i);
  if (text[i] !== '<') return i;
  for (let depth = 0; i < text.length; i++) {
    if (text[i] === '<') depth++;
    else if (text[i] === '>' && text[i - 1] !== '=' && --depth === 0) return i + 1;
  }
  return i;
}

// Reads one call argument, respecting nesting and string literals. Returns its source text.
function readArgument(text, i) {
  i = skipSpace(text, i);
  const start = i;
  let depth = 0, quote = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if (c === ',' && depth === 0) break;
  }
  return { source: text.slice(start, i).trim(), end: i };
}

function objectKeys(source) {
  const inner = source.slice(1, -1);
  const keys = [];
  let depth = 0, quote = null, current = '';
  const flush = () => {
    const entry = current.trim();
    current = '';
    if (!entry) return true;
    if (entry.startsWith('...')) return false;
    const match = entry.match(/^['"]?([A-Za-z_$][\w$]*)['"]?\s*(:|\(|$)/);
    if (!match) return false;
    keys.push(match[1]);
    return true;
  };
  for (const c of inner) {
    if (quote) { current += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    if ('({['.includes(c)) depth++;
    if (')}]'.includes(c)) depth--;
    if (c === ',' && depth === 0) { if (!flush()) return null; continue; }
    current += c;
  }
  return flush() ? keys : null;
}

function describeBody(source) {
  if (source === undefined || source === '' || source === 'null' || source === 'undefined') return { kind: 'none' };
  if (source.startsWith('{') && source.endsWith('}')) {
    const keys = objectKeys(source);
    return keys ? { kind: 'keys', keys } : { kind: 'opaque', source };
  }
  return { kind: 'opaque', source };
}

function normalizeRoute(url) {
  return url.replace(/\$\{[^}]*\}/g, '{p}').split('?')[0].replace(/\/+$/, '');
}

export function extractClientCalls(root) {
  const app = path.join(root, 'frontend-angular', 'src', 'app');
  const calls = [];
  const unresolved = [];
  for (const file of walk(app)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (rel.endsWith('dashboard.gateway.ts')) continue; // only prefixes /api/v1 onto its callers' paths
    const constants = Object.fromEntries([...text.matchAll(/const\s+(\w+)\s*=\s*'([^']+)'/g)].map(m => [m[1], m[2]]));
    for (const match of text.matchAll(HTTP_CALL)) {
      const [, receiver, verb] = match;
      let i = skipGenerics(text, match.index + match[0].length);
      i = skipSpace(text, i);
      if (text[i] !== '(') continue;
      const urlArgument = readArgument(text, i + 1);
      const line = lineOf(text, match.index);
      const site = {
        file: rel, line, source: text.split('\n')[line - 1].trim(),
        // From the start of the call's line to just past its URL argument, for acknowledgements.
        context: text.slice(text.lastIndexOf('\n', match.index) + 1, urlArgument.end + 120),
      };
      let raw = urlArgument.source;
      const literal = raw.match(/^(['"`])([\s\S]*)\1$/);
      if (literal) raw = literal[2].replace(/\$\{(\w+)\}/g, (all, name) => constants[name] ?? all);
      else if (constants[raw]) raw = constants[raw];
      else { unresolved.push(site); continue; }

      const viaDashboard = receiver === 'gateway';
      const url = viaDashboard ? `/api/v1${raw}` : raw;
      if (!url.startsWith('/api/')) continue; // static assets such as locale tables
      const method = verb === 'upload' ? 'POST' : verb.toUpperCase();
      let body = { kind: 'none' };
      if (verb === 'upload') body = { kind: 'form' };
      else if (['post', 'put', 'patch'].includes(verb) && text[urlArgument.end] === ',')
        body = describeBody(readArgument(text, urlArgument.end + 1).source);
      // A DELETE carries its body in the options object: http.delete(url, { body: { ... } }).
      else if (verb === 'delete' && text[urlArgument.end] === ',') {
        const options = readArgument(text, urlArgument.end + 1).source;
        const at = options.search(/\bbody\s*:/);
        if (at >= 0) body = describeBody(readArgument(options, options.indexOf(':', at) + 1).source);
      }
      calls.push({ method, route: normalizeRoute(url), body, ...site, via: viaDashboard ? 'DashboardGateway' : 'HttpClient' });
    }
  }
  // Dashboard tabs load their sources with GET through DashboardGateway.load.
  const model = path.join(app, 'features', 'dashboards', 'models', 'dashboard.ts');
  const modelText = fs.readFileSync(model, 'utf8');
  const modelRel = path.relative(root, model).replaceAll('\\', '/');
  for (const tab of modelText.matchAll(/tab\('(\w+)',\s*'[^']*',\s*\[([^\]]*)\]/g))
    for (const source of tab[2].matchAll(/'([^']+)'/g))
      calls.push({ method: 'GET', route: normalizeRoute(`/api/v1${source[1]}`), body: { kind: 'none' },
        file: modelRel, line: lineOf(modelText, tab.index), source: `tab ${tab[1]}`, via: 'Dashboard tab' });
  return { calls, unresolved };
}

// ------------------------------------------------------------------ matching

const segments = route => route.replace(/^\//, '').split('/');
const isParameter = segment => /^\{.*\}$/.test(segment);

function score(clientRoute, serverRoute) {
  const a = segments(clientRoute), b = segments(serverRoute);
  if (a.length !== b.length) return -1;
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    if (isParameter(b[i])) { total += isParameter(a[i]) ? 2 : 1; continue; }
    if (isParameter(a[i]) || a[i].toLowerCase() !== b[i].toLowerCase()) return -1;
    total += 3;
  }
  return total;
}

export function checkContract({ endpoints, dynamic }, { calls, unresolved }, root) {
  const violations = [];
  const add = (kind, call, detail) => violations.push({
    kind, method: call.method, route: call.route, file: call.file, detail,
  });

  for (const entry of dynamic.unresolvedSites) {
    const text = fs.readFileSync(path.join(root, entry.file), 'utf8');
    if (!text.includes(entry.snippet))
      throw new Error(`tests/contracts/dynamic-client-calls.json: "${entry.snippet}" no longer appears in ${entry.file}`);
  }
  for (const site of unresolved) {
    const declared = dynamic.unresolvedSites.some(x => x.file === site.file && site.context.includes(x.snippet));
    if (!declared) violations.push({ kind: 'UNRESOLVED_CALL', method: '?', route: '?', file: site.file,
      detail: `computed URL at line ${site.line}: ${site.source}` });
  }
  const allCalls = [...calls, ...dynamic.calls.map(x => ({ ...x, body: x.body ?? { kind: 'none' }, line: 0 }))];

  const seen = new Set();
  let matched = 0;
  for (const call of allCalls) {
    const key = `${call.method} ${call.route} ${call.file} ${JSON.stringify(call.body)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const candidates = endpoints.map(e => ({ e, s: score(call.route, e.route) })).filter(x => x.s >= 0);
    if (!candidates.length) { add('NO_ROUTE', call, 'no endpoint has this path'); continue; }
    const best = Math.max(...candidates.map(x => x.s));
    const top = candidates.filter(x => x.s === best);
    const endpoint = top.find(x => x.e.methods.includes(call.method))?.e;
    if (!endpoint) {
      const verbs = [...new Set(candidates.flatMap(x => x.e.methods))].sort().join('/');
      add('WRONG_VERB', call, `path exists only as ${verbs}`);
      continue;
    }
    const swallowed = segments(call.route)
      .map((segment, i) => [segment, segments(endpoint.route)[i]])
      .filter(([segment, parameter]) => !isParameter(segment) && isParameter(parameter) && !DISCRIMINATORS.has(parameter));
    if (swallowed.length) {
      add('SHADOWED', call, `"${swallowed.map(x => x[0]).join('/')}" binds ${endpoint.route} (${endpoint.action})`);
      continue;
    }
    matched++;
    const server = endpoint.body;
    if (call.body.kind === 'opaque' || call.body.kind === 'form' || server?.kind === 'form') continue;
    if (!server) {
      if (call.body.kind === 'keys' && call.body.keys.length)
        add('BODY_NOT_ACCEPTED', call, `sends {${call.body.keys.join(', ')}}; ${endpoint.action} binds no body`);
      continue;
    }
    if (!server.fields) continue;
    const sentKeys = call.body.kind === 'keys' ? call.body.keys : [];
    const sent = new Set(sentKeys.map(k => k.toLowerCase()));
    const known = new Set(server.fields.map(f => f.name.toLowerCase()));
    const missing = server.fields.filter(f => f.required && !sent.has(f.name.toLowerCase())).map(f => f.name);
    const unknown = sentKeys.filter(k => !known.has(k.toLowerCase()));
    if (missing.length) add('BODY_MISSING_REQUIRED', call, `${server.type} requires ${missing.join(', ')}`);
    if (unknown.length) add('BODY_UNKNOWN_FIELD', call, `${server.type} does not bind ${unknown.join(', ')}`);
  }
  violations.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  return { violations, matched, callShapes: seen.size };
}

export const keyOf = v => `${v.kind} | ${v.method} ${v.route} | ${v.file} | ${v.detail}`;
