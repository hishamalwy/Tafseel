// Request-budget tracer + deterministic rolling-window scheduler.
// Records no secrets, JWTs, cookies, or message bodies.

const wait = ms => new Promise(r => setTimeout(r, ms));

export const GLOBAL_LIMIT = 300;
export const GLOBAL_WINDOW_MS = 60_000;
export const AUTH_LIMIT = 10;
export const AUTH_WINDOW_MS = 60_000;

const AUTH_PATH = /\/api\/v1\/auth\/(login|refresh|register|forgot-password|reset-password|confirm-email|password)(?:\?|$)/i;

export function classifyUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname || "";
    if (AUTH_PATH.test(path)) return "auth";
    if (/\/hubs\/messages/i.test(path)) return path.includes("negotiate") ? "negotiate" : "signalr";
    if (/\/api\/v1\/conversations\/[^/]+\/messages/i.test(path)) return "messages";
    if (/\/api\/v1\/conversations/i.test(path)) return "conversations";
    if (/\/api\/v1\/orders/i.test(path)) return "orders";
    if (/\/api\/v1\/learning-requests/i.test(path)) return "learningRequests";
    if (/\/api\/v1\/notifications/i.test(path)) return "notifications";
    if (/\/api\/v1\//i.test(path)) return "apiOther";
    if (/\/app\//i.test(path) || path === "/" || path === "/favicon.ico") return "static";
    return "other";
  } catch {
    return "other";
  }
}

export function isFirstParty(url, baseUrl) {
  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    return target.hostname === base.hostname && target.port === base.port;
  } catch {
    return /127\.0\.0\.1|localhost/.test(String(url));
  }
}

export function createRequestBudget({
  baseUrl,
  globalLimit = GLOBAL_LIMIT,
  globalWindowMs = GLOBAL_WINDOW_MS,
  authLimit = AUTH_LIMIT,
  authWindowMs = AUTH_WINDOW_MS,
  globalSafety = 50,
  authSafety = 2
} = {}) {
  const events = [];
  let scenario = "init";
  let cycle = 0;
  let aborted = false;

  function prune(list, now, windowMs) {
    const cutoff = now - windowMs;
    let i = 0;
    while (i < list.length && list[i] <= cutoff) i += 1;
    if (i) list.splice(0, i);
    return list.length;
  }

  const globalTimes = [];
  const authTimes = [];

  function snapshot(now = Date.now()) {
    const globalUsed = prune(globalTimes, now, globalWindowMs);
    const authUsed = prune(authTimes, now, authWindowMs);
    return {
      at: now,
      scenario,
      cycle,
      globalUsed,
      globalAvailable: Math.max(0, globalLimit - globalUsed),
      globalHeadroom: Math.max(0, globalLimit - globalSafety - globalUsed),
      authUsed,
      authAvailable: Math.max(0, authLimit - authUsed),
      authHeadroom: Math.max(0, authLimit - authSafety - authUsed),
      globalLimit,
      authLimit,
      globalSafety,
      authSafety
    };
  }

  function record(kind, info) {
    const now = Date.now();
    const family = classifyUrl(info.url || "");
    const firstParty = isFirstParty(info.url || "", baseUrl);
    if (firstParty && kind === "request") {
      globalTimes.push(now);
      if (family === "auth") authTimes.push(now);
    }
    const snap = snapshot(now);
    const row = {
      t: now,
      iso: new Date(now).toISOString(),
      kind,
      role: info.role || "",
      scenario,
      cycle,
      method: info.method || "",
      family,
      route: sanitizeRoute(info.url || ""),
      status: info.status || 0,
      firstParty,
      rolling60s: snap.globalUsed,
      authRolling60s: snap.authUsed
    };
    events.push(row);
    return row;
  }

  async function waitForHeadroom(estimate, label) {
    const needGlobal = Math.max(1, Number(estimate.global || estimate) || 1);
    const needAuth = Math.max(0, Number(estimate.auth || 0));
    const started = Date.now();
    let waited = 0;
    for (;;) {
      const snap = snapshot();
      if (snap.globalHeadroom >= needGlobal && snap.authHeadroom >= needAuth) {
        return { ...snap, label, waitedMs: waited, estimate: { global: needGlobal, auth: needAuth } };
      }
      const now = Date.now();
      const nextGlobalFree = globalTimes.length ? globalTimes[0] + globalWindowMs - now : 0;
      const nextAuthFree = authTimes.length && needAuth ? authTimes[0] + authWindowMs - now : 0;
      const slice = Math.min(4000, Math.max(150, Math.min(
        nextGlobalFree > 0 ? nextGlobalFree + 25 : 4000,
        nextAuthFree > 0 ? nextAuthFree + 25 : 4000
      )));
      await wait(slice);
      waited = Date.now() - started;
      if (waited > 180000) {
        throw new Error(`budget wait exceeded 180s for ${label} need=${JSON.stringify({ needGlobal, needAuth })} snap=${JSON.stringify(snapshot())}`);
      }
    }
  }

  function summarizeWindow(startedAt, finishedAt) {
    const slice = events.filter(e => e.kind === "response" && e.t >= startedAt && e.t <= finishedAt && e.firstParty);
    const reqs = events.filter(e => e.kind === "request" && e.t >= startedAt && e.t <= finishedAt && e.firstParty);
    const count = fam => reqs.filter(e => e.family === fam).length;
    const statuses = slice.map(e => e.status);
    return {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      apiRequests: reqs.filter(e => e.family !== "static" && e.family !== "other").length,
      firstPartyRequests: reqs.length,
      authRequests: count("auth"),
      conversationRequests: count("conversations"),
      orderRequests: count("orders"),
      notificationRequests: count("notifications"),
      messageRequests: count("messages"),
      learningRequestRequests: count("learningRequests"),
      signalRNegotiateRequests: count("negotiate"),
      signalRRequests: count("signalr"),
      staticRequests: count("static"),
      status2xx: statuses.filter(s => s >= 200 && s < 300).length,
      status401: statuses.filter(s => s === 401).length,
      status429: statuses.filter(s => s === 429).length,
      families: reqs.reduce((acc, e) => {
        acc[e.family] = (acc[e.family] || 0) + 1;
        return acc;
      }, {}),
      routes: reqs.reduce((acc, e) => {
        const key = `${e.method} ${e.route}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    };
  }

  function attachPage(page, role) {
    page.on("request", req => {
      if (!isFirstParty(req.url(), baseUrl)) return;
      record("request", { role, url: req.url(), method: req.method() });
    });
    page.on("response", res => {
      if (!isFirstParty(res.url(), baseUrl)) return;
      const headers = {};
      const retryAfter = res.headers()["retry-after"];
      const remaining = res.headers()["ratelimit-remaining"] || res.headers()["x-ratelimit-remaining"];
      const reset = res.headers()["ratelimit-reset"] || res.headers()["x-ratelimit-reset"];
      if (retryAfter) headers.retryAfter = retryAfter;
      if (remaining) headers.rateLimitRemaining = remaining;
      if (reset) headers.rateLimitReset = reset;
      const row = record("response", { role, url: res.url(), method: res.request().method(), status: res.status() });
      if (Object.keys(headers).length) row.limiterHeaders = headers;
      if (res.status() === 429) aborted = true;
    });
  }

  return {
    events,
    snapshot,
    record,
    waitForHeadroom,
    summarizeWindow,
    attachPage,
    setScenario(name, cycleNo) { scenario = name; if (cycleNo != null) cycle = cycleNo; },
    getScenario: () => ({ scenario, cycle }),
    saw429: () => aborted || events.some(e => e.status === 429),
    limiterHeadersSeen() {
      return events.filter(e => e.limiterHeaders).map(e => ({ route: e.route, status: e.status, headers: e.limiterHeaders }));
    },
    maxRolling() {
      return events.reduce((m, e) => Math.max(m, e.rolling60s || 0), 0);
    },
    maxAuthRolling() {
      return events.reduce((m, e) => Math.max(m, e.authRolling60s || 0), 0);
    },
    config: { globalLimit, globalWindowMs, authLimit, authWindowMs, globalSafety, authSafety, baseUrl }
  };
}

export function sanitizeRoute(url) {
  try {
    const u = new URL(url);
    return (u.pathname + u.search)
      .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ":id")
      .replace(/\d{6,}/g, ":n");
  } catch {
    return String(url).split("?")[0];
  }
}

export function deriveBatchPlan(perCycleGlobal, perCycleAuth, {
  globalLimit = GLOBAL_LIMIT,
  authLimit = AUTH_LIMIT,
  globalSafety = 50,
  authSafety = 2
} = {}) {
  const globalBudget = Math.max(1, globalLimit - globalSafety);
  const authBudget = Math.max(1, authLimit - authSafety);
  const byGlobal = Math.max(1, Math.floor(globalBudget / Math.max(1, perCycleGlobal)));
  const byAuth = Math.max(1, Math.floor(authBudget / Math.max(1, perCycleAuth || 1)));
  const batchSize = Math.max(1, Math.min(byGlobal, byAuth, 5));
  return {
    perCycleGlobal,
    perCycleAuth,
    globalBudget,
    authBudget,
    batchSize,
    reason: `batchSize=min(floor(${globalBudget}/${perCycleGlobal}), floor(${authBudget}/${perCycleAuth || 1}), 5)=${batchSize}`
  };
}
