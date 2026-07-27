import { existsSync, readFileSync, readdirSync } from "node:fs";

const pages = readdirSync(".").filter(x => x.endsWith(".dc.html"));

function markupOf(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
}

function logicOf(source) {
  const match = source.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  return match ? match[1] : "";
}

function extractRenderValsBody(logic) {
  const start = logic.search(/renderVals\s*\(\s*\)\s*\{/);
  if (start < 0) return "";
  const brace = logic.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < logic.length; i++) {
    const ch = logic[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return logic.slice(brace + 1, i);
    }
  }
  return "";
}

function returnedKeys(renderBody) {
  const keys = new Set();
  for (const match of renderBody.matchAll(/(?:^|[,\{\s])([A-Za-z_][\w]*)\s*:/g))
    keys.add(match[1]);
  return keys;
}

function templateBindings(markup) {
  const names = new Set();
  for (const match of markup.matchAll(/\{\{\s*([A-Za-z_][\w]*)/g))
    names.add(match[1]);
  return names;
}

for (const page of pages) {
  const source = readFileSync(page, "utf8");
  const markup = markupOf(source);

  if (/href\s*=\s*["']#["']/.test(markup))
    throw new Error(`${page} has a dead href="#" link — wire it to a real destination or remove it.`);
  if (/javascript:void\(0\)/i.test(markup))
    throw new Error(`${page} has a javascript:void(0) placeholder link.`);

  for (const match of markup.matchAll(/href\s*=\s*["'](Tafseel-[\w-]+\.dc\.html)["']/g)) {
    if (!existsSync(match[1]))
      throw new Error(`${page} links to missing page: ${match[1]}`);
  }

  // Literal mustache on HTML `value=` for typed inputs survives parse as an invalid value.
  // DC's `sc-camel-value=` is allowed (maps to React value without an HTML value attribute).
  for (const match of markup.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype\s*=\s*["'](?:number|range|date)["']/i.test(tag)) continue;
    if (/(?:^|<input\b|\s)value\s*=\s*["']\s*\{\{/i.test(tag))
      throw new Error(`${page} has a literal {{ ... }} template expression inside a number/range/date input value — use sc-camel-value="{{ ... }}" so HTML parse does not see an invalid typed value.`);
  }
}

const adminPage = "Tafseel-Admin-Dashboard.dc.html";
if (!existsSync(adminPage))
  throw new Error(`Missing ${adminPage}`);

const adminSource = readFileSync(adminPage, "utf8");
const adminLogic = logicOf(adminSource);
const adminMarkup = markupOf(adminSource);
const adminRender = extractRenderValsBody(adminLogic);
const adminKeys = returnedKeys(adminRender);

if (!/let\s+USERS\s*=\s*\[\s*\]/.test(adminLogic) && !/const\s+USERS\s*=\s*\[\s*\]/.test(adminLogic))
  throw new Error(`${adminPage} must initialize API-backed USERS as an empty array.`);

if (/\busersTotal\s*:\s*[^\n,]*\busers\./.test(adminRender) || /\|\|\s*users\.length\b/.test(adminRender))
  throw new Error(`${adminPage} renderVals references undefined 'users' (use filtered.length / usersShown from the canonical USERS collection).`);

for (const required of ["langLabel", "themeIcon", "users", "usersShown", "usersTotal", "commissionRate", "usersLoading", "usersLoadError", "usersEmpty", "usersReady", "usersLoadingLabel", "usersEmptyLabel"]) {
  if (!adminKeys.has(required))
    throw new Error(`${adminPage} renderVals must return '${required}' so production bindings resolve.`);
}

if (!/Tafseel\.t\(\s*['"]language_target['"]\s*\)/.test(adminRender))
  throw new Error(`${adminPage} langLabel must come from localization (Tafseel.t('language_target')), not an English-only hardcode.`);

if (!/theme\s*===\s*['"]dark['"]/.test(adminRender))
  throw new Error(`${adminPage} themeIcon must follow theme state.`);

if (!/usersLoading/.test(adminLogic) || !/usersLoadError/.test(adminLogic) || !/Promise\.allSettled/.test(adminLogic))
  throw new Error(`${adminPage} must keep loading / empty / API failure states distinct (usersLoading, usersLoadError, Promise.allSettled).`);

if (!/sc-camel-value\s*=\s*["']\s*\{\{\s*commissionRate\s*\}\}/.test(adminMarkup))
  throw new Error(`${adminPage} commissionRate must bind through sc-camel-value, not HTML value="{{ commissionRate }}".`);

const topBindings = [...templateBindings(adminMarkup)].filter(name =>
  ["langLabel", "themeIcon", "commissionRate", "users", "usersShown", "usersTotal", "usersLoading", "usersLoadError", "usersEmpty", "usersReady"].includes(name)
);
for (const name of topBindings) {
  if (!adminKeys.has(name))
    throw new Error(`${adminPage} template binds {{ ${name} }} but renderVals does not return it — would remain unresolved in production.`);
}

for (const required of ["drawer", "drawerState", "drawerExpanded", "toggleDrawer", "closeDrawer", "headerStyle", "navItems"]) {
  if (!adminKeys.has(required))
    throw new Error(`${adminPage} renderVals must return '${required}' for drawer/nav integrity.`);
}

if (!/navKey/.test(adminLogic))
  throw new Error(`${adminPage} must track navKey so remapped sections (users/catalog/list) still highlight the clicked nav item.`);

if (/Teacher Applications/.test(adminLogic) || /applications['"]\s*,\s*['"]◷/.test(adminLogic) || /Tafseel-Quality-Dashboard\.dc\.html/.test(adminLogic))
  throw new Error(`${adminPage} must not link Teacher Applications into Admin nav (QualityReviewer owns /teacher-applications/queue).`);

if (!/navigateTo\s*\(/.test(adminLogic) || !/toggleDrawer\s*\(\s*\)\s*\{/.test(adminLogic))
  throw new Error(`${adminPage} must expose navigateTo + toggleDrawer methods that read live this.state (not a stale renderVals closure).`);

// Smoke: every Admin nav key switches section state and keeps matching active styling; drawer toggles open/closed.
{
  const smoke = `
    const document = {
      body: { style: { overflow: '' } },
      getElementById() { return null; },
      querySelector() { return null; },
      addEventListener() {},
      removeEventListener() {}
    };
    const Tafseel = {
      lang: 'en', theme: 'light',
      t: (k) => k === 'language_target' ? 'العربية' : k,
      toggleTheme() {}, toggleLang() {},
      api: { errorMessage: (e) => String(e && e.message || e) }
    };
    class DCLogic {}
    ${adminLogic}
    USERS = [];
    const c = new Component();
    c.setState = function (patch) { this.state = { ...this.state, ...patch }; };
    c.state = { ...c.state, usersLoading: false, usersLoadError: '', usersTotal: 0, liveWithdrawals: [], catalogErrors: {} };
    const expected = {
      overview: { page: 'overview' },
      users: { page: 'users', pageRole: 'all' },
      students: { page: 'users', pageRole: 'Student' },
      teachers: { page: 'users', pageRole: 'Teacher' },
      reviewers: { page: 'users', pageRole: 'Reviewer' },
      subjects: { page: 'catalog', catalogKind: 'subjects' },
      topics: { page: 'catalog', catalogKind: 'topics' },
      services: { page: 'catalog', catalogKind: 'services' },
      coupons: { page: 'catalog', catalogKind: 'coupons' },
      requests: { page: 'list', listKind: 'requests' },
      sessions: { page: 'list', listKind: 'sessions' },
      reviews: { page: 'list', listKind: 'reviews' },
      disputes: { page: 'list', listKind: 'disputes' },
      payments: { page: 'payments' },
      withdrawals: { page: 'withdrawals' },
      reports: { page: 'reports' },
      settings: { page: 'settings' }
    };
    const vals0 = c.renderVals();
    if (!Array.isArray(vals0.navItems) || vals0.navItems.length !== Object.keys(expected).length)
      throw new Error('navItems length must match supported Admin section keys');
    if (vals0.navItems.some(n => n.key === 'applications' || /application/i.test(n.label || '')))
      throw new Error('Teacher Applications must not appear in Admin navItems');
    for (const item of vals0.navItems) {
      const want = expected[item.key];
      if (!want) throw new Error('unexpected nav key: ' + item.key);
      c.navigateTo(item.key);
      for (const [field, value] of Object.entries(want)) {
        if (c.state[field] !== value)
          throw new Error(item.key + ' should set ' + field + '=' + value + ' got ' + c.state[field]);
      }
      if (c.state.navKey !== item.key) throw new Error(item.key + ' must set navKey');
      if (c.state.drawer !== false) throw new Error(item.key + ' must close drawer');
      const vals = c.renderVals();
      const active = vals.navItems.find(n => n.key === item.key);
      if (!active || active.current !== 'page')
        throw new Error(item.key + ' must show aria-current=page when selected');
      if (!String(active.style || '').includes('var(--primary)'))
        throw new Error(item.key + ' must use active nav styling when selected');
      const others = vals.navItems.filter(n => n.key !== item.key && n.current === 'page');
      if (others.length)
        throw new Error(item.key + ' left other nav items active: ' + others.map(n => n.key).join(','));
      if (item.key === 'overview' && vals.isOverview !== true) throw new Error('overview section flag');
      if (item.key === 'users' && vals.isUsersPage !== true) throw new Error('users section flag');
      if (item.key === 'students' && (vals.isUsersPage !== true || vals.usersPageTitle !== 'Students'))
        throw new Error('students must open users page filtered to Students');
      if (item.key === 'subjects' && vals.isCatalogPage !== true) throw new Error('subjects catalog flag');
      if (item.key === 'requests' && vals.isSimpleListPage !== true) throw new Error('requests list flag');
      if (item.key === 'payments' && vals.isPaymentsPage !== true) throw new Error('payments flag');
      if (item.key === 'withdrawals' && vals.isPaymentsPage !== true) throw new Error('withdrawals flag');
      if (item.key === 'reports' && vals.isReportsPage !== true) throw new Error('reports flag');
      if (item.key === 'settings' && vals.isSettingsPage !== true) throw new Error('settings flag');
    }
    c.state = { ...c.state, drawer: false };
    c.toggleDrawer();
    if (c.state.drawer !== true) throw new Error('toggleDrawer must open when closed');
    let valsOpen = c.renderVals();
    if (valsOpen.drawer !== true || valsOpen.drawerState !== 'open' || valsOpen.drawerExpanded !== 'true')
      throw new Error('open drawer must export drawer/drawerState/drawerExpanded');
    if (!String(valsOpen.headerStyle || '').includes('z-index:46'))
      throw new Error('open drawer must raise header above sidebar so toggle stays clickable');
    c.toggleDrawer();
    if (c.state.drawer !== false) throw new Error('toggleDrawer must close when open');
    let valsClosed = c.renderVals();
    if (valsClosed.drawer !== false || valsClosed.drawerState !== 'closed')
      throw new Error('closed drawer must export drawer=false / drawerState=closed');
  `;
  try {
    new Function(smoke)();
  } catch (error) {
    throw new Error(`${adminPage} nav/drawer integrity smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Smoke: renderVals must not throw when USERS is empty (Admin Dashboard empty result).
{
  const smoke = `
    const Tafseel = {
      lang: 'en', theme: 'light',
      t: (k) => k === 'language_target' ? 'العربية' : k === 'admin_users_loading' ? 'Loading users…' : k === 'admin_users_empty' ? 'No users returned.' : k,
      toggleTheme() {}, toggleLang() {},
      api: { errorMessage: (e) => String(e && e.message || e) }
    };
    class DCLogic {}
    ${adminLogic}
    USERS = [];
    const c = new Component();
    c.state = { ...c.state, usersLoading: false, usersLoadError: '', usersTotal: 0, liveWithdrawals: [], catalogErrors: {} };
    const vals = c.renderVals();
    if (!vals || typeof vals !== 'object') throw new Error('renderVals returned nothing');
    if (!Array.isArray(vals.users)) throw new Error('users must be an array');
    if (vals.users.length !== 0) throw new Error('empty USERS must render zero users');
    if (vals.usersEmpty !== true) throw new Error('empty USERS must set usersEmpty');
    if (vals.usersReady !== false) throw new Error('empty USERS must not set usersReady');
    if (vals.langLabel !== 'العربية') throw new Error('langLabel unresolved');
    if (!vals.themeIcon) throw new Error('themeIcon unresolved');
    if (typeof vals.commissionRate !== 'number' || Number.isNaN(vals.commissionRate))
      throw new Error('commissionRate must be numeric');
  `;
  try {
    new Function(smoke)();
  } catch (error) {
    throw new Error(`${adminPage} empty-users render smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Smoke: Admin Dashboard API failure state stays renderable (no undefined renderVals vars).
{
  const smoke = `
    const Tafseel = {
      lang: 'en', theme: 'dark',
      t: (k) => k === 'language_target' ? 'EN' : k === 'admin_users_loading' ? 'Loading users…' : k === 'admin_users_empty' ? 'No users returned.' : k,
      toggleTheme() {}, toggleLang() {},
      api: { errorMessage: (e) => String(e && e.message || e) }
    };
    class DCLogic {}
    ${adminLogic}
    USERS = [];
    const c = new Component();
    c.state = {
      ...c.state,
      usersLoading: false,
      usersLoadError: '',
      catalogErrors: { services: 'catalog services failed' },
      catalogKind: 'services',
      usersTotal: 0,
      liveWithdrawals: []
    };
    const vals = c.renderVals();
    if (vals.catalogLoadError !== 'catalog services failed')
      throw new Error('API failure state not exposed');
    if (vals.usersLoadError)
      throw new Error('catalog failure must not invent a usersLoadError');
    if (!Array.isArray(vals.users) || vals.users.length !== 0)
      throw new Error('API failure must keep users as empty array without fake data');
    if (vals.usersEmpty !== true) throw new Error('API failure with empty USERS must set usersEmpty');
    if (vals.usersReady !== false) throw new Error('API failure must not mark usersReady');
    if (vals.langLabel !== 'EN') throw new Error('langLabel must resolve during API failure');
    if (vals.themeIcon !== '☀') throw new Error('themeIcon must resolve during API failure');
  `;
  try {
    new Function(smoke)();
  } catch (error) {
    throw new Error(`${adminPage} API-failure render smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`Frontend integrity validation passed for ${pages.length} entry points.`);
