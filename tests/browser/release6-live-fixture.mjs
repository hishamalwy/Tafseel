// Create/reuse a legitimate live TeacherService + bookable availability via supported APIs only.
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, CREDENTIALS } from "./lib/auth.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release6-discovery-conversion", "final-acceptance");
fs.mkdirSync(outDir, { recursive: true });

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`teacher login failed: ${res.status}`);
  const data = await res.json();
  return { token: data.accessToken, userId: data.userId };
}

async function api(token, method, url, body, headers = {}) {
  const res = await fetch(`${BASE_URL}/api/v1${url}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, data, etag: res.headers.get("etag") || res.headers.get("ETag") };
}

function zoneId() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
}

async function main() {
  const password = CREDENTIALS.Teacher.password;
  if (!password) throw new Error("Teacher UAT password missing");
  const { token, userId } = await login(CREDENTIALS.Teacher.email, password);
  const me = await api(token, "GET", "/teachers/me");
  if (!me.ok) throw new Error(`teachers/me failed ${me.status}`);
  const teacherId = me.data.teacherId || me.data.id || userId;
  const published = !!(me.data.isPublished || me.data.published);
  if (!published) {
    const pub = await api(token, "PUT", "/teachers/me/publication", { published: true });
    if (!pub.ok && pub.status !== 204) throw new Error(`publication failed ${pub.status} ${JSON.stringify(pub.data)}`);
  }

  const [subjects, services, mine, quals] = await Promise.all([
    api(token, "GET", "/subjects"),
    api(token, "GET", "/services"),
    api(token, "GET", "/teachers/me/marketplace-services"),
    api(token, "GET", "/teachers/me")
  ]);
  const liveCatalog = (services.data || []).find(x =>
    x.isActive && x.isPublic && x.teacherSelectable && String(x.orderType || x.code) === "live_session"
      || String(x.code || "").toLowerCase() === "live_session");
  if (!liveCatalog) throw new Error("no public teacher-selectable live_session catalog item");

  const qualified = ((quals.data && quals.data.subjects) || me.data.subjects || [])
    .map(s => s.id || s.subjectId)
    .filter(Boolean);
  const subjectId = qualified[0] || ((subjects.data || [])[0] && (subjects.data || [])[0].id);
  if (!subjectId) throw new Error("no qualified subject for live offering");

  let liveService = (mine.data || []).find(x =>
    x.serviceCatalogItemId === liveCatalog.id && x.isActive && !x.isSuperseded);
  if (!liveService) {
    const price = Number(liveCatalog.defaultPrice || liveCatalog.recommendedPrice || liveCatalog.minimumPrice || 120);
    const created = await api(token, "POST", "/teachers/me/services", {
      subjectId,
      serviceCatalogItemId: liveCatalog.id,
      price,
      currency: liveCatalog.currencyCode || "SAR",
      deliveryHours: 1,
      revisions: 0,
      approachEn: "Release 6 live conversion fixture",
      approachAr: "تجهيز تحويل الجلسة المباشرة",
      isAvailable: true
    });
    if (!created.ok) throw new Error(`add live service failed ${created.status} ${JSON.stringify(created.data)}`);
    liveService = created.data;
  }

  const existingRules = me.data.availability || me.data.Availability || [];
  const tz = zoneId();
  if (existingRules.length === 0) {
    for (let day = 0; day <= 6; day += 1) {
      const added = await api(token, "POST", "/teachers/me/availability/rules", {
        dayOfWeek: day,
        start: "09:00:00",
        end: "21:00:00",
        timeZoneId: tz,
        slotMinutes: 60
      });
      if (!added.ok && added.data && added.data.code !== "availability_conflict")
        throw new Error(`add rule failed ${added.status} ${JSON.stringify(added.data)}`);
    }
  }

  const summary = await api(token, "GET",
    `/live-sessions/availability-summaries?teacherIds=${encodeURIComponent(teacherId)}&teacherServiceId=${encodeURIComponent(liveService.id)}&viewerTimeZoneId=${encodeURIComponent(tz)}`);
  if (!summary.ok) throw new Error(`availability summary failed ${summary.status} ${JSON.stringify(summary.data)}`);
  const row = (summary.data.summaries || [])[0] || null;
  const bookable = !!(row && row.teacherServiceId === liveService.id
    && ["available_today", "next_available"].includes(row.state));

  const today = new Date().toISOString().slice(0, 10);
  const slots = await api(token, "GET",
    `/live-sessions/teachers/${encodeURIComponent(teacherId)}/slots?teacherServiceId=${encodeURIComponent(liveService.id)}&from=${today}&days=14&durationMinutes=${(liveCatalog.allowedDurations && liveCatalog.allowedDurations[0]) || 60}&studentTimeZoneId=${encodeURIComponent(tz)}`);

  const browse = await fetch(`${BASE_URL}/api/v1/teachers?subjectId=${encodeURIComponent(subjectId)}&serviceTypeId=${encodeURIComponent(liveCatalog.id)}&pageSize=20`);
  const browseJson = await browse.json();
  const card = (browseJson.items || []).find(x => x.teacherId === teacherId);

  const evidence = {
    teacherId,
    subjectId,
    liveCatalogItemId: liveCatalog.id,
    liveCatalogCode: liveCatalog.code,
    teacherServiceId: liveService.id,
    summaryState: row && row.state,
    summaryTeacherServiceId: row && row.teacherServiceId,
    bookable,
    slotCount: Array.isArray(slots.data) ? slots.data.length : 0,
    browseExposesOffer: !!(card && card.contextOffer && card.contextOffer.id === liveService.id),
    published: true
  };
  if (!bookable) throw new Error(`live fixture not bookable: ${JSON.stringify(evidence)}`);
  if (!evidence.browseExposesOffer) throw new Error(`browse missing exact live offer: ${JSON.stringify(evidence)}`);
  fs.writeFileSync(path.join(outDir, "live-fixture.json"), JSON.stringify(evidence, null, 2));
  console.log("LIVE_FIXTURE_OK teacherServiceId=" + liveService.id + " state=" + row.state + " slots=" + evidence.slotCount);
}

main().catch(err => {
  console.error(String(err && err.message || err));
  process.exit(1);
});
