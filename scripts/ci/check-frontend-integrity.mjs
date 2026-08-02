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

{
  const browse = readFileSync("Tafseel-Browse-Teachers.dc.html", "utf8");
  const profile = readFileSync("Tafseel-Teacher-Profile.dc.html", "utf8");
  const shared = readFileSync("js/tafseel.js", "utf8");

  if (/Online now|onlineOnly|weekOnly|Available this week/.test(browse))
    throw new Error("Browse Teachers must not infer online state or use the legacy schedule-presence filter.");
  if (!/Tafseel\.availabilityPath\(ids\)/.test(browse)
      || !/availabilityByTeacher/.test(browse)
      || !/\['availability', 'availability_field'/.test(browse))
    throw new Error("Browse and comparison must use the canonical bounded availability batch.");
  if (!/Tafseel\.availabilityPath\(\[teacherId\]\)/.test(profile)
      || /profile\.availability/.test(profile))
    throw new Error("Public Teacher Profile must use the summary and must not render raw weekly rules.");
  for (const state of [
    "available_today",
    "next_available",
    "no_upcoming_availability",
    "no_schedule_configured",
    "temporarily_unavailable",
    "fully_booked",
    "not_applicable"
  ]) {
    if (!shared.includes(state))
      throw new Error(`Shared availability presenter is missing state '${state}'.`);
  }
  if (!/new Intl\.DateTimeFormat/.test(shared) || !/timeZone: zone/.test(shared))
    throw new Error("Availability timestamps must be localized with Intl in the viewer timezone.");
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
      defaultAvatar: 'assets/brand/default-avatar.svg',
      avatarUrl: function (userId, hasAvatar) {
        return hasAvatar && userId
          ? '/api/v1/users/' + encodeURIComponent(userId) + '/avatar'
          : this.defaultAvatar;
      },
      userName: function (user) { return user && (user.fullName || user.name || '') || ''; },
      money: function (value) { return String(value ?? 0); },
      partyName: function () { return 'Teacher'; },
      date: function () { return ''; },
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
      assignments: { page: 'catalog', catalogKind: 'assignments' },
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
      if (item.key === 'students' && (vals.isUsersPage !== true || vals.usersPageTitle !== 'admin_nav_students'))
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
      defaultAvatar: 'assets/brand/default-avatar.svg',
      avatarUrl: function (userId, hasAvatar) {
        return hasAvatar && userId
          ? '/api/v1/users/' + encodeURIComponent(userId) + '/avatar'
          : this.defaultAvatar;
      },
      userName: function (user) { return user && (user.fullName || user.name || '') || ''; },
      money: function (value) { return String(value ?? 0); },
      partyName: function () { return 'Teacher'; },
      date: function () { return ''; },
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
      defaultAvatar: 'assets/brand/default-avatar.svg',
      avatarUrl: function (userId, hasAvatar) {
        return hasAvatar && userId
          ? '/api/v1/users/' + encodeURIComponent(userId) + '/avatar'
          : this.defaultAvatar;
      },
      userName: function (user) { return user && (user.fullName || user.name || '') || ''; },
      money: function (value) { return String(value ?? 0); },
      partyName: function () { return 'Teacher'; },
      date: function () { return ''; },
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

for (const page of [
  "Tafseel-Student-Dashboard.dc.html",
  "Tafseel-Teacher-Dashboard.dc.html",
  "Tafseel-Quality-Dashboard.dc.html"
]) {
  const source = readFileSync(page, "utf8");
  if (!source.includes("tf-dashboard-logout") || !source.includes("await Tafseel.api.logout()"))
    throw new Error(`${page} must expose a working logout action.`);
}

const browse = readFileSync("Tafseel-Browse-Teachers.dc.html", "utf8");
if (/let\s+TEACHERS\s*=\s*\[\s*\{/.test(browse))
  throw new Error("Browse Teachers must not seed mock teacher rows — start from [].");
if (!/teachersLoading/.test(browse))
  throw new Error("Browse Teachers must expose teachersLoading.");
if (/\bNoor\b|>\s*NA\s*</.test(browse))
  throw new Error("Browse Teachers public header must not render a dummy signed-in user.");
if (!/sessionChecked/.test(browse) || !/Tafseel\.api\.ready\(\)/.test(browse))
  throw new Error("Browse Teachers public header must resolve the real auth session.");
if (!/verifiedOnly:\s*false/.test(browse))
  throw new Error("Browse Teachers must not silently enable verified-only filtering.");
if (!/languageChecks/.test(browse) || !/t\.languages/.test(browse))
  throw new Error("Browse Teachers language checkboxes must use real teacher language data.");
if (/value="(?:recommended|response|experience)"/.test(browse))
  throw new Error("Browse Teachers must not expose unsupported performance sorts.");
if (/t\.(?:completed|response)\b|responseTimeMinutes|completedOrders/.test(browse))
  throw new Error("Browse Teachers must not present unsupported completion or response metrics.");
if (!/t\.rating\s*!=\s*null/.test(browse))
  throw new Error("Browse Teachers must distinguish missing ratings from a real zero.");

const quality = readFileSync("Tafseel-Quality-Dashboard.dc.html", "utf8");
if (/let\s+APPLICATIONS\s*=\s*\[\s*\{/.test(quality))
  throw new Error("Quality Dashboard must not seed mock applications — start from [].");
if (!/queueLoading/.test(quality))
  throw new Error("Quality Dashboard must expose queueLoading.");

const chat = readFileSync("js/chat-widget.js", "utf8");
if (!chat.includes("HubConnectionBuilder"))
  throw new Error("Embedded chat must connect to the SignalR message hub.");
for (const dashboard of ["Tafseel-Student-Dashboard.dc.html", "Tafseel-Teacher-Dashboard.dc.html"]) {
  if (!readFileSync(dashboard, "utf8").includes("js/chat-widget.js"))
    throw new Error(`${dashboard} must load embedded chat.`);
}
if (existsSync("Tafseel-Chat.dc.html"))
  throw new Error("Standalone chat must not be published as a product page.");
if (!existsSync("js/vendor/signalr.min.js"))
  throw new Error("Missing vendored SignalR client: js/vendor/signalr.min.js");
if (existsSync("js/auth.js"))
  throw new Error("js/auth.js was removed as dead code — do not restore without a page that loads it.");

const landing = readFileSync("Tafseel-Landing.dc.html", "utf8");
if (/grid-template-columns\s*:\s*repeat\(\s*3\s*,/.test(landing) && !/tf-stat-grid|tf-cols-3|auto-fit/.test(landing))
  throw new Error("Landing must not keep an unmarked rigid repeat(3) grid.");
if (/grid-template-columns\s*:\s*repeat\(\s*2\s*,/.test(landing) && !landing.includes("tf-cols-2") && !landing.includes("data-stack"))
  throw new Error("Landing must not keep an unmarked rigid repeat(2) reasons grid.");
if (!/\/subjects\/featured/.test(landing) || !/take=4/.test(landing))
  throw new Error("Landing featured subjects must load GET /subjects/featured?take=4 from the API.");
if (/liveSubjects:\s*\(subjects\s*\|\|\s*\[\]\)\.map/.test(landing) && !/featured/.test(landing))
  throw new Error("Landing must not render the full /subjects catalog as featured tiles.");
if (!/subjectId=['"]?\s*\+\s*encodeURIComponent\(subject\.id\)/.test(landing))
  throw new Error("Landing featured subject tiles must deep-link with subjectId, not a search name.");
if (!/Tafseel\.api\.ready\(\)/.test(landing) || !/accountName/.test(landing))
  throw new Error("Landing must preserve and display the real signed-in session.");
if (!/Tafseel-Auth\.dc\.html\?mode=register&role=teacher/.test(landing))
  throw new Error("Landing teacher CTAs must enter Teacher registration directly.");
if (/teacher\.responseTimeMinutes|fast responses|answering fast/.test(landing))
  throw new Error("Landing must not present unsupported teacher response-time claims.");
if (!/teacher\.rating\s*!=\s*null/.test(landing))
  throw new Error("Landing must distinguish missing ratings from a real zero.");

const publicProfile = readFileSync("Tafseel-Teacher-Profile.dc.html", "utf8");
if (/profile\.(?:completedOrders|responseTimeMinutes)/.test(publicProfile))
  throw new Error("Public Teacher Profile must not present unsupported completion or response metrics.");
if (!/profile\.rating\s*!=\s*null/.test(publicProfile))
  throw new Error("Public Teacher Profile must distinguish missing ratings from a real zero.");
for (const page of ["Tafseel-Book-Session.dc.html", "Tafseel-Request.dc.html"]) {
  if (readFileSync(page, "utf8").includes("profile.responseTimeMinutes"))
    throw new Error(`${page} must not fabricate a public response-time claim.`);
}
{
  const requestPage = readFileSync("Tafseel-Request.dc.html", "utf8");
  if (!requestPage.includes("js/guided-request.js"))
    throw new Error("Request page must load guided-request helpers.");
  if (!requestPage.includes("If-Match") || !/uploaded\.version|uploaded && uploaded\.version/.test(requestPage))
    throw new Error("Request page must chain attachment uploads with the latest version.");
  if (!requestPage.includes("req_file_reselect_warning") && !requestPage.includes("fileReselectWarning"))
    throw new Error("Request page must warn that files are not restored after refresh.");
  if (!requestPage.includes("showSchedulingOnly") || !requestPage.includes("Tafseel-Book-Session.dc.html"))
    throw new Error("Request page must redirect scheduling-only services to Book Session.");
  if (!requestPage.includes("checklistItems") || (!requestPage.includes("composeDescription") && !requestPage.includes("buildDescription")))
    throw new Error("Request page must expose checklist and description composition.");
  const apiProgram = readFileSync("src/Tafseel.Api/Program.cs", "utf8");
  if (!apiProgram.includes('"guided-request.js"') && !apiProgram.includes("guided-request.js"))
    throw new Error("API static allowlist must serve js/guided-request.js.");
}
const studentDashboard = readFileSync("Tafseel-Student-Dashboard.dc.html", "utf8");
if (/href\s*=\s*["']Tafseel-Request\.dc\.html["']/.test(studentDashboard))
  throw new Error("Student Dashboard must not open the Request wizard without a Teacher.");
if (!studentDashboard.includes("Tafseel-Browse-Teachers.dc.html") || !studentDashboard.includes("dash_new_request"))
  throw new Error("Student Dashboard new-request CTA must route to Browse Teachers.");
if (/rating:\s*String\(x\.rating\)/.test(studentDashboard) || !/x\.rating\s*!=\s*null/.test(studentDashboard))
  throw new Error("Student saved-teacher cards must distinguish missing ratings from a real zero.");
const teacherDashboard = readFileSync("Tafseel-Teacher-Dashboard.dc.html", "utf8");
for (const [name, dashboard] of [
  ["Student", studentDashboard],
  ["Teacher", teacherDashboard]
]) {
  if (!/\/orders\/['"]?\s*\+\s*encodeURIComponent\(item\.id\)\s*\+\s*['"]\/timeline/.test(dashboard))
    throw new Error(`${name} Dashboard must load the canonical owned Order timeline endpoint.`);
  for (const state of ["timelineLoading", "timelineError", "timelineEmpty", "timelineHasEvents"])
    if (!dashboard.includes(state))
      throw new Error(`${name} Dashboard Order timeline is missing its ${state} state.`);
  if (!/role="dialog"[^>]*aria-modal="true"/.test(dashboard) || !/<ol[^>]*aria-label/.test(dashboard))
    throw new Error(`${name} Dashboard Order timeline must preserve dialog and ordered-list semantics.`);
}
const sharedUi = readFileSync("js/tafseel.js", "utf8");
if (!/orderTimelineEvent:\s*function/.test(sharedUi))
  throw new Error("Order timeline event localization must stay in the shared frontend helper.");
if (!/modalKeyDown:\s*function/.test(sharedUi) || !studentDashboard.includes("Tafseel.modalKeyDown") || !teacherDashboard.includes("Tafseel.modalKeyDown"))
  throw new Error("Order timeline dialogs must share keyboard focus handling.");
for (const behavior of ["event.key === 'Escape'", "event.key !== 'Tab'", "event.preventDefault()", "last.focus()", "first.focus()"])
  if (!sharedUi.includes(behavior))
    throw new Error(`Shared modal keyboard handling is missing ${behavior}.`);
const localeSource = readFileSync("js/locales.js", "utf8");
for (const key of [
  "order_timeline_title",
  "order_timeline_event_awaiting_payment",
  "order_timeline_event_delivery_uploaded",
  "order_timeline_event_revision_requested"
]) {
  if ((localeSource.match(new RegExp(`"${key}"`, "g")) || []).length !== 2)
    throw new Error(`Order timeline locale key ${key} must exist once in English and Arabic.`);
}

const auth = readFileSync("Tafseel-Auth.dc.html", "utf8");
if (!/role\s*===\s*['"]teacher['"]\s*\?\s*['"]teacher['"]\s*:\s*['"]student['"]/.test(auth))
  throw new Error("Auth must honor the validated Teacher registration query.");

const teacherApply = readFileSync("js/teacher-apply.js", "utf8");
if (!/\/teachers\/me\/languages/.test(teacherApply) || !/selectedLanguageIds/.test(teacherApply))
  throw new Error("Teacher application must save at least one selected teaching language.");

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
{
  const quality = readFileSync("Tafseel-Quality-Dashboard.dc.html", "utf8");
  if (/Sami Mattar/.test(quality) || />SM</.test(quality))
    throw new Error("Quality Dashboard must not hardcode reviewer identity.");
  if (!/accountName/.test(quality))
    throw new Error("Quality Dashboard must render the signed-in reviewer name.");
}
{
  const student = readFileSync("Tafseel-Student-Dashboard.dc.html", "utf8");
  if (/Welcome back, Noor/.test(student))
    throw new Error("Student Dashboard must not hardcode greeting identity.");
  if (!/Promise\.allSettled/.test(student))
    throw new Error("Student Dashboard initial load must use Promise.allSettled.");
  if (!/dash_search_unavailable/.test(student))
    throw new Error("Student Dashboard must honestly disable unavailable search.");
}
if (!/\/admin\/reports\/popular-subjects/.test(readFileSync("Tafseel-Admin-Dashboard.dc.html", "utf8")))
  throw new Error("Admin Dashboard must load popular subjects from the real reports API.");


const comparisonPage = readFileSync("Tafseel-Browse-Teachers.dc.html", "utf8");
for (const required of [
  "/teachers/compare?",
  "s.compare.length >= 3",
  "compareDisabled",
  "compareUnavailableCount",
  "Tafseel.modalKeyDown",
  'role="dialog"',
  'aria-modal="true"',
  "tf-compare-table",
  "tf-compare-mobile"
]) {
  if (!comparisonPage.includes(required))
    throw new Error(`Teacher comparison is missing required bounded UI behavior: ${required}.`);
}
if (/completedOrders|responseTimeMinutes|acceptanceRate|cancellationRate|refundRate|revisionRate/i.test(comparisonPage))
  throw new Error("Teacher comparison must not present unsupported marketplace metrics.");
for (const key of [
  "compare_add",
  "compare_action",
  "compare_unavailable",
  "compare_field_subjects",
  "compare_field_rating",
  "compare_self_reported",
  "compare_session_price"
]) {
  if ((localeSource.match(new RegExp(`"${key}"`, "g")) || []).length !== 2)
    throw new Error(`Teacher comparison locale key ${key} must exist once in English and Arabic.`);
}
{
  const comparisonLogic = logicOf(comparisonPage);
  const smoke = `
    const location = { search: '' };
    const document = { body: { style: {} }, contains: () => false, getElementById: () => null };
    const setTimeout = fn => { fn(); return 1; };
    const Tafseel = {
      lang: 'en', theme: 'light', defaultAvatar: 'default.svg',
      t: (key, values) => values ? Object.entries(values).reduce((text, pair) => text.replace('{' + pair[0] + '}', pair[1]), key) : key,
      number: value => String(value),
      userName: teacher => teacher.fullName || teacher.name || '',
      partyDisplayName: (primary, english) => english || primary || '',
      languageLabel: language => language.name,
      avatarUrl: () => 'default.svg',
      dashboardHrefForSession: () => '',
      viewerTimeZone: () => ({ id: 'UTC', fallback: true }),
      availabilityPath: () => '/live-sessions/availability-summaries',
      availabilityText: summary => summary && summary.state || 'availability_error',
      toastClass: () => '',
      api: { errorMessage: () => 'error' }
    };
    class DCLogic {}
    ${comparisonLogic}
    TEACHERS = [1, 2, 3, 4].map(id => ({
      id: String(id), name: 'Teacher ' + id, subject: 'Math', level: 'Verified',
      hasRating: false, rating: null, reviews: 0, bio: '', skills: ['Math'],
      languages: '', langs: [], price: 100, online: false, verified: true,
      thisWeek: false, levels: [], services: [], avatar: 'default.svg'
    }));
    const c = new Component();
    c.setState = patch => { c.state = { ...c.state, ...patch }; };
    c.state = { ...c.state, teachersLoading: false, sessionChecked: true, languageOptions: [] };
    for (const id of ['1', '2', '3']) {
      const item = c.renderVals().results.find(teacher => teacher.id === id);
      item.onCompare();
    }
    if (c.state.compare.join(',') !== '1,2,3') throw new Error('three selections must be preserved in selection order');
    let flashed = '';
    c.flash = message => { flashed = message; };
    c.renderVals().results.find(teacher => teacher.id === '4').onCompare();
    if (c.state.compare.join(',') !== '1,2,3' || !flashed.includes('compare_limit_reached'))
      throw new Error('fourth selection must be rejected without silently replacing a teacher');
    c.state = { ...c.state, compare: ['1'], q: 'no-match' };
    if (c.renderVals().compareDisabled !== true || c.state.compare.join(',') !== '1')
      throw new Error('selection must survive filters and comparison must stay disabled below two');
    c.state = {
      ...c.state, compare: ['1', '2'], q: '', compareTeachers: [
        { teacherId: '1', fullName: 'One', verified: true, subjects: [], topics: [], languages: [], educationLevels: [], services: [], experience: [], sampleCount: 0, rating: null, ratingCount: 0 },
        { teacherId: '2', fullName: 'Two', verified: true, subjects: [], topics: [], languages: [], educationLevels: [], services: [], experience: [], sampleCount: 0, rating: null, ratingCount: 0 }
      ]
    };
    const vals = c.renderVals();
    if (vals.compareDisabled || vals.comparisonTeachers.length !== 2 || vals.comparisonRows.length < 10)
      throw new Error('two public teachers must render a complete comparison');
  `;
  try {
    new Function(smoke)();
  } catch (error) {
    throw new Error(`Teacher comparison behavior smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const css = readFileSync("css/tafseel.css", "utf8");
for (const token of [".tf-page", ".tf-grid", ".tf-table-wrap", ".tf-stat-grid", ".tf-skip", ".tf-dashboard-shell"]) {
  if (!css.includes(token))
    throw new Error(`css/tafseel.css missing layout system class: ${token}`);
}

{
  const teacherDash = readFileSync("Tafseel-Teacher-Dashboard.dc.html", "utf8");
  const teacherMarkup = markupOf(teacherDash);
  const teacherLogic = logicOf(teacherDash);
  if (/Open messages/.test(teacherMarkup))
    throw new Error("Teacher Dashboard must not expose a sidebar Open messages opener.");
  if (/aria-label="Messages"[\s\S]{0,80}✉/.test(teacherMarkup) || /✉[\s\S]{0,120}onClick="\{\{\s*openChat\s*\}\}"/.test(teacherMarkup.split("<main")[0] || ""))
    throw new Error("Teacher Dashboard header must not duplicate messaging via mail icon.");
  if (!teacherLogic.includes("/teachers/me/eligible-subjects"))
    throw new Error("Teacher Dashboard must load eligible subjects from /teachers/me/eligible-subjects.");
  if (!teacherLogic.includes("/teachers/me/publication"))
    throw new Error("Teacher Dashboard must call /teachers/me/publication for marketplace visibility.");
  if (/finalPrice:\s*130|deliveryDate:\s*'2026-07-30'/.test(teacherLogic))
    throw new Error("Teacher Dashboard must not hardcode accept modal price/date demo values.");
  if (!/Promise\.allSettled/.test(teacherLogic))
    throw new Error("Teacher Dashboard must load dashboard slices with Promise.allSettled.");
  const navMatch = teacherLogic.match(/const NAV = \[([\s\S]*?)\];/);
  if (!navMatch) throw new Error("Teacher Dashboard NAV definition missing.");
  const navKeys = [...navMatch[1].matchAll(/\['([a-z_]+)'/g)].map(m => m[1]);
  const requiredNav = ["overview","new","orders","sessions","services","samples","availability","messages","reviews","earnings","withdrawals","profile","settings"];
  for (const key of requiredNav) {
    if (!navKeys.includes(key))
      throw new Error(`Teacher Dashboard NAV missing key: ${key}`);
  }
  if (!teacherDash.includes('id="active-orders"') || !teacherDash.includes('id="live-sessions"') || !teacherDash.includes('id="new-requests"'))
    throw new Error("Teacher Dashboard overview sections must define new-requests, active-orders, and live-sessions anchors.");
  if (!/overviewAnchors/.test(teacherLogic))
    throw new Error("Teacher Dashboard nav must map overview anchors for new/orders/sessions.");
  for (const expected of ["isServices","isSamples","isAvailability","isMessages","isReviewsSection","isEarnings","isWithdrawals","isProfile","isSettings"]) {
    if (!teacherLogic.includes(expected + ":"))
      throw new Error(`Teacher Dashboard missing section flag ${expected}.`);
  }
}

{
  const teacher = readFileSync("Tafseel-Teacher-Dashboard.dc.html", "utf8");
  const quality = readFileSync("Tafseel-Quality-Dashboard.dc.html", "utf8");
  const profile = readFileSync("Tafseel-Teacher-Profile.dc.html", "utf8");
  for (const endpoint of ["/teachers/me/showcases", "/teachers/me/showcases/order"]) {
    if (!teacher.includes(endpoint)) throw new Error(`Teacher Showcase UI missing endpoint: ${endpoint}`);
  }
  if (!teacher.includes('accept="video/mp4,.mp4"') || /\bpublish\b/i.test(markupOf(teacher).match(/showcase[\s\S]*?isAvailability/)?.[0] || ""))
    throw new Error("Teacher Showcase UI must be MP4-only and must not expose direct publication.");
  for (const endpoint of ["/teachers/showcase-moderation?pageSize=20", "/start-review", "/decision"]) {
    if (!quality.includes(endpoint)) throw new Error(`Quality Showcase UI missing endpoint: ${endpoint}`);
  }
  if (!quality.includes('controls preload="metadata"') || /\bautoplay\b|\<iframe\b/i.test(quality))
    throw new Error("Quality Showcase preview must use safe controls without autoplay or iframes.");
  for (const trust of ["qualification_sample", "reviewed_showcase", "trust_qualification_sample", "trust_reviewed_showcase"]) {
    if (!profile.includes(trust)) throw new Error(`Public profile missing explicit trust separation: ${trust}`);
  }
  if (!profile.includes('controls preload="metadata"') || /\bautoplay\b|\<iframe\b/i.test(profile))
    throw new Error("Public Showcase preview must use safe controls without autoplay or iframes.");
  if (!css.includes('[data-stack="showcase-review"]'))
    throw new Error("Showcase review must collapse to one column on mobile.");
}

console.log(`Frontend integrity validation passed for ${pages.length} entry points.`);
