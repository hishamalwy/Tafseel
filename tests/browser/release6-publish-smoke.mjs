import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5092";
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD
  || process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
const studentEmail = process.env.TAFSEEL_UAT_STUDENT_EMAIL || "student.sprint02.uat@example.com";
const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release6-discovery-conversion", "final-acceptance");
const fixturePath = path.join(outDir, "live-fixture.json");
const fixture = fs.existsSync(fixturePath) ? JSON.parse(fs.readFileSync(fixturePath, "utf8")) : null;
fs.mkdirSync(outDir, { recursive: true });

const checks = [];
const unexpected = { status429: [], status500: [] };
const record = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
};

async function get(url, token) {
  const res = await fetch(`${BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (res.status === 429) unexpected.status429.push(url);
  if (res.status >= 500) unexpected.status500.push(url);
  return { status: res.status, cache: res.headers.get("cache-control") || "", text: await res.text() };
}

async function main() {
  if (!password) throw new Error("UAT password env is required");
  const live = await get("/health/live");
  const ready = await get("/health/ready");
  record("health-live", live.status === 200, live.cache);
  record("health-ready", ready.status === 200, ready.cache);

  for (const page of [
    ["/app/Tafseel-Landing.dc.html", "public-landing"],
    ["/app/Tafseel-Browse-Teachers.dc.html", "public-browse"],
    ["/app/Tafseel-Teacher-Profile.dc.html?id=" + (fixture?.teacherId || "00000000-0000-0000-0000-000000000001"), "public-profile"],
    ["/app/Tafseel-Browse-Teachers.dc.html?compare=" + (fixture?.teacherId || ""), "public-compare"]
  ]) {
    const r = await get(page[0]);
    record(page[1], r.status === 200, `${r.status} ${r.cache}`);
  }

  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: studentEmail, password })
  });
  const loginJson = await login.json().catch(() => ({}));
  record("student-login", login.status === 200, String(login.status));
  const token = loginJson.accessToken;
  if (token && fixture?.teacherId) {
    const fav = await fetch(`${BASE}/api/v1/favorite-teachers/${fixture.teacherId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (fav.status === 429) unexpected.status429.push("/favorite-teachers");
    record("student-favorite", fav.status === 200 || fav.status === 204, String(fav.status));
    const favState = await get(`/api/v1/favorite-teachers`, token);
    record("student-favorite-state", favState.status === 200, String(favState.status));
    const reqPage = await get(`/app/Tafseel-Request.dc.html?teacherId=${fixture.teacherId}&teacherServiceId=${fixture.teacherServiceId || ""}`);
    record("protected-request-route", reqPage.status === 200, `${reqPage.status} ${reqPage.cache}`);
    const book = await get(`/app/Tafseel-Book-Session.dc.html?teacherId=${fixture.teacherId}&teacherServiceId=${fixture.teacherServiceId}`);
    record("live-scheduler-context", book.status === 200, `${book.status} ${book.cache}`);
    const slots = await get(`/api/v1/live-sessions/availability-summaries?teacherIds=${fixture.teacherId}&teacherServiceId=${fixture.teacherServiceId}`);
    record("live-scheduler-slots-api", slots.status === 200, String(slots.status));
  } else {
    record("student-favorite", false, "missing token/fixture");
    record("student-favorite-state", false, "missing token/fixture");
    record("protected-request-route", false, "missing token/fixture");
    record("live-scheduler-context", false, "missing token/fixture");
    record("live-scheduler-slots-api", false, "missing token/fixture");
  }

  const css = await get("/app/css/tafseel.css");
  record("static-css", css.status === 200 && /no-cache/i.test(css.cache), `${css.status} ${css.cache}`);
  const js = await get("/app/js/tafseel.js");
  record("static-js", js.status === 200 && /no-cache/i.test(js.cache), `${js.status} ${js.cache}`);
  record("no-unexpected-429", unexpected.status429.length === 0, JSON.stringify(unexpected.status429));
  record("no-unexpected-500", unexpected.status500.length === 0, JSON.stringify(unexpected.status500));

  const summary = { base: BASE, checks, unexpected };
  fs.writeFileSync(path.join(outDir, "publish-smoke-final.json"), JSON.stringify(summary, null, 2));
  if (checks.some(x => !x.pass)) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
