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

for (const required of ["drawer", "drawerState", "drawerExpanded", "toggleDrawer", "closeDrawer", "navItems", "showSaudiFlag", "showUkFlag", "langSwitchLabel"]) {
  if (!adminKeys.has(required))
    throw new Error(`${adminPage} renderVals must return '${required}' for drawer/nav/flag integrity.`);
}

if (!/class\s*=\s*["'][^"']*tf-lang-toggle/.test(adminMarkup))
  throw new Error(`${adminPage} language control must use .tf-lang-toggle (Saudi/UK flag), not text labels.`);

if (/\{\{\s*langLabel\s*\}\}/.test(adminMarkup))
  throw new Error(`${adminPage} must not render {{ langLabel }} text; use flag toggle instead.`);

if (!/navKey/.test(adminLogic))
  throw new Error(`${adminPage} must track navKey so remapped sections (users/catalog/list) still highlight the clicked nav item.`);

if (!/compactNav/.test(adminLogic) || !/matchMedia/.test(adminLogic))
  throw new Error(`${adminPage} must use matchMedia compactNav so the hamburger only toggles below 1024px.`);

if (/Teacher Applications/.test(adminLogic) || /applications['"]\s*,\s*['"]◷/.test(adminLogic) || /Tafseel-Quality-Dashboard\.dc\.html/.test(adminLogic))
  throw new Error(`${adminPage} must not link Teacher Applications into Admin nav (QualityReviewer owns /teacher-applications/queue).`);

if (!/navigateTo\s*\(/.test(adminLogic) || !/toggleDrawer\s*\(/.test(adminLogic))
  throw new Error(`${adminPage} must expose navigateTo + toggleDrawer methods that read live this.state (not a stale renderVals closure).`);

if (!/admin_empty_sessions/.test(adminLogic) || !/listEmpty/.test(adminLogic))
  throw new Error(`${adminPage} must expose honest empty states for list pages including live sessions.`);

if (!/admin\/coupons/.test(adminLogic) || !/admin_add_service/.test(adminLogic))
  throw new Error(`${adminPage} must wire coupons and service create against real admin APIs.`);

// Smoke: every Admin nav key switches section state and keeps matching active styling; drawer toggles open/closed.
{
  const smoke = `
    const setTimeout = (fn) => { fn(); return 1; };
    const clearTimeout = () => {};
    const document = {
      body: { style: { overflow: '' } },
      getElementById() { return null; },
      querySelector() { return null; },
      addEventListener() {},
      removeEventListener() {}
    };
    const window = {
      matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; }
    };
    const Tafseel = {
      lang: 'en', theme: 'light',
      t: (k) => k === 'language_target' ? 'العربية' : k,
      toastClass: (leaving) => leaving ? 'tf-toast is-leaving' : 'tf-toast',
      flash() {},
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
    if (c.state.drawer !== false) throw new Error('toggleDrawer must no-op when compactNav is false');
    c.state = { ...c.state, compactNav: true, drawer: false };
    c.toggleDrawer();
    if (c.state.drawer !== true) throw new Error('toggleDrawer must open when compact and closed');
    let valsOpen = c.renderVals();
    if (valsOpen.drawer !== true || valsOpen.drawerState !== 'open' || valsOpen.drawerExpanded !== 'true')
      throw new Error('open drawer must export drawer/drawerState/drawerExpanded');
    if (valsOpen.headerElevated !== 'elevated')
      throw new Error('open drawer must elevate admin header for toggle stacking');
    c.toggleDrawer();
    if (c.state.drawer !== false) throw new Error('toggleDrawer must close when open');
    let valsClosed = c.renderVals();
    if (valsClosed.drawer !== false || valsClosed.drawerState !== 'closed')
      throw new Error('closed drawer must export drawer=false / drawerState=closed');
    c.state = { ...c.state, lang: 'en' };
    const enFlags = c.renderVals();
    if (enFlags.showSaudiFlag !== true || enFlags.showUkFlag !== false)
      throw new Error('EN UI must show Saudi flag as language target');
    c.state = { ...c.state, lang: 'ar' };
    const arFlags = c.renderVals();
    if (arFlags.showUkFlag !== true || arFlags.showSaudiFlag !== false)
      throw new Error('AR UI must show UK flag as language target');
    c.navigateTo('sessions');
    const sessionVals = c.renderVals();
    if (sessionVals.listEmpty !== true || !String(sessionVals.listEmptyLabel || '').length)
      throw new Error('empty live sessions must expose localized empty copy');
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
      toastClass: (leaving) => leaving ? 'tf-toast is-leaving' : 'tf-toast',
      flash() {},
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
      toastClass: (leaving) => leaving ? 'tf-toast is-leaving' : 'tf-toast',
      flash() {},
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

// Canonical drawer pattern on role dashboards (Admin remains separately smoke-tested above).
for (const [page, ids] of [
  ["Tafseel-Student-Dashboard.dc.html", ["student-sidebar", "student-drawer-toggle"]],
  ["Tafseel-Teacher-Dashboard.dc.html", ["teacher-sidebar", "teacher-drawer-toggle"]],
  ["Tafseel-Quality-Dashboard.dc.html", ["quality-sidebar", "quality-drawer-toggle"]],
  ["Tafseel-Admin-Dashboard.dc.html", ["admin-sidebar", "admin-drawer-toggle"]]
]) {
  const source = readFileSync(page, "utf8");
  if (!source.includes('data-drawer-overlay="{{ drawerState }}"'))
    throw new Error(`${page} must include data-drawer-overlay bound to drawerState.`);
  if (!source.includes('data-drawer-toggle'))
    throw new Error(`${page} must mark the hamburger with data-drawer-toggle.`);
  for (const id of ids) {
    if (!source.includes(`id="${id}"`))
      throw new Error(`${page} must define id="${id}".`);
  }
  if (!/installDashboardDrawer|compactNav/.test(source) && !page.includes("Admin"))
    throw new Error(`${page} must install the shared dashboard drawer (or Admin compactNav).`);
}

const browse = readFileSync("Tafseel-Browse-Teachers.dc.html", "utf8");
if (/let\s+TEACHERS\s*=\s*\[\s*\{/.test(browse))
  throw new Error("Browse Teachers must not seed mock teacher rows — start from [].");
if (!/teachersLoading/.test(browse))
  throw new Error("Browse Teachers must expose teachersLoading.");

const quality = readFileSync("Tafseel-Quality-Dashboard.dc.html", "utf8");
if (/let\s+APPLICATIONS\s*=\s*\[\s*\{/.test(quality))
  throw new Error("Quality Dashboard must not seed mock applications — start from [].");
if (!/queueLoading/.test(quality))
  throw new Error("Quality Dashboard must expose queueLoading.");

const chat = readFileSync("Tafseel-Chat.dc.html", "utf8");
if (!chat.includes("js/vendor/signalr.min.js"))
  throw new Error("Chat page must load the vendored SignalR client.");
if (!existsSync("js/vendor/signalr.min.js"))
  throw new Error("Missing vendored SignalR client: js/vendor/signalr.min.js");
if (existsSync("js/auth.js"))
  throw new Error("js/auth.js was removed as dead code — do not restore without a page that loads it.");

const landing = readFileSync("Tafseel-Landing.dc.html", "utf8");
if (/grid-template-columns\s*:\s*repeat\(\s*3\s*,/.test(landing) && !/tf-stat-grid|tf-cols-3|auto-fit/.test(landing))
  throw new Error("Landing must not keep an unmarked rigid repeat(3) grid.");
if (/grid-template-columns\s*:\s*repeat\(\s*2\s*,/.test(landing) && !landing.includes("tf-cols-2") && !landing.includes("data-stack"))
  throw new Error("Landing must not keep an unmarked rigid repeat(2) reasons grid.");

// Ban known illustrative analytics / fake trend patterns across published pages + page scripts.
const analyticsBanned = [
  [/\+18%\s*MoM/i, "+18% MoM illustrative trend"],
  [/\+\d+%\s*MoM/i, "invented MoM percentage trend"],
  [/1,240\s+teachers/i, "hardcoded teacher census"],
  [/revenueChart\s*:\s*\[\s*0\s*\]/, "placeholder zero-height revenue chart"],
  [/ordersChart\s*:\s*\[\s*0\s*\]/, "placeholder zero-height orders chart"],
  [/chartData\s*=\s*\[[^\]]*[1-9]/, "hardcoded student activity chart series"],
  [/reportChart\s*:\s*\[[^\]]*[1-9]/, "hardcoded quality report chart series"]
];
for (const page of pages) {
  const source = readFileSync(page, "utf8");
  for (const [pattern, label] of analyticsBanned) {
    if (pattern.test(source))
      throw new Error(`${page} still contains illustrative analytics (${label}). Use localized unavailable states instead.`);
  }
}
if (!/trend_unavailable/.test(readFileSync("Tafseel-Admin-Dashboard.dc.html", "utf8")))
  throw new Error("Admin overview must expose Tafseel.t('trend_unavailable') when analytics APIs are absent.");
if (!/chartsEmpty/.test(readFileSync("Tafseel-Admin-Dashboard.dc.html", "utf8")))
  throw new Error("Admin overview must gate charts behind chartsEmpty / chartsReady.");

const css = readFileSync("css/tafseel.css", "utf8");
for (const token of [".tf-page", ".tf-grid", ".tf-table-wrap", ".tf-stat-grid", ".tf-skip", ".tf-dashboard-shell"]) {
  if (!css.includes(token))
    throw new Error(`css/tafseel.css missing layout system class: ${token}`);
}

console.log(`Frontend integrity validation passed for ${pages.length} entry points.`);
