/**
 * PASS 01 closure fixture — creates the minimum legitimate Development state needed to prove the
 * repaired table repeaters against populated data.
 *
 * Everything goes through the same canonical API endpoints a real user's browser calls:
 * teacher application -> teaching demo -> submit -> Quality Reviewer approval -> profile ->
 * service offering -> public sample -> publication, then Student learning request -> Teacher
 * accept -> Order -> payment. No raw SQL, no direct row inserts, no authorization bypass, no
 * fabricated browser arrays.
 *
 * Idempotent: every step checks current state first and skips work already done, so re-running
 * does not create duplicate applications, services, or orders.
 *
 * Run:  PW=<dev seed password> node tests/browser/fixture-pass01-surfaces.mjs
 */
const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const PW = process.env.PW || process.env.TAFSEEL_UAT_ADMIN_PASSWORD;
if (!PW) throw new Error("Set PW to the Development seed password");

const log = (...a) => console.log(...a);

async function api(method, path, { token, body, headers = {}, form } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined && !form) h["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: form ? form : body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { ok: res.ok, status: res.status, body: parsed, etag: res.headers.get("etag") };
}
const must = (r, what) => {
  if (!r.ok) throw new Error(`${what} failed: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
  return r.body;
};
// The Development "auth" rate-limit policy is 10 requests/minute, so tokens are cached and each
// account is logged in at most once per run.
const tokens = new Map();
async function login(email) {
  if (!tokens.has(email)) {
    tokens.set(email, must(
      await api("POST", "/api/v1/auth/login", { body: { email, password: PW } }), `login ${email}`).accessToken);
  }
  return tokens.get(email);
}

// TeacherApplicationStatus and the review contract are serialized as numeric enums.
const APP = { Draft: 0, Submitted: 1, UnderReview: 2, ChangesRequested: 3, Approved: 4, Rejected: 5, Withdrawn: 6 };
const APPROVE = 0; // ReviewDecision.Approve
/** All nine EvaluationCriterion values must be scored exactly once for a decision to validate. */
const FULL_SCORES = Array.from({ length: 9 }, (_, criterion) => ({ criterion, score: 5 }));

/** A real, minimal ISO base-media (MP4) file: `ftyp` box + `mdat` box. */
function minimalMp4(padBytes = 4096) {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // size, 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // 'isom', minor version
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32  // compatible brands 'isom','iso2'
  ]);
  const payload = Buffer.alloc(padBytes, 0x21);
  const mdatHeader = Buffer.alloc(8);
  mdatHeader.writeUInt32BE(payload.length + 8, 0);
  mdatHeader.write("mdat", 4, "ascii");
  return Buffer.concat([ftyp, mdatHeader, payload]);
}

async function uploadVideo(path, token, version, fields = {}) {
  const form = new FormData();
  form.append("file", new Blob([minimalMp4()], { type: "video/mp4" }), "demo.mp4");
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  return api("POST", path, { token, form, headers: version ? { "If-Match": `"${version}"` } : {} });
}

// ---------------------------------------------------------------------------------------------
/** Drives one teacher account from "no qualification" to "published, with an active service". */
async function ensurePublishedTeacher(email, { subjectName, headline, city, serviceTitle, price }) {
  const token = await login(email);
  const reviewer = await login("quality@gmail.com");
  const status0 = must(await api("GET", "/api/v1/teachers/onboarding-status", { token }), "onboarding-status");
  log(`\n=== TEACHER ${email} — published=${status0.isPublished} qualified=${status0.approvedSubjectIds.length > 0}`);

  // 1. Approved qualification -------------------------------------------------------------
  if (!status0.approvedSubjectIds.length) {
    const subjects = must(await api("GET", "/api/v1/subjects", { token }), "subjects");
    const subject = subjects.find((s) => s.name === subjectName) || subjects[0];
    const topics = must(
      await api("GET", `/api/v1/topics?subjectId=${subject.id}&qualificationOnly=true`, { token }), "topics");
    const topic = topics[0];

    let mine = must(await api("GET", "/api/v1/teacher-applications/mine", { token }), "applications");
    let app = mine.find((a) => a.status !== APP.Rejected && a.status !== APP.Withdrawn);
    if (!app) {
      app = must(await api("POST", "/api/v1/teacher-applications", {
        token,
        body: { subjectId: subject.id, qualificationTopicId: topic.id, city, experienceYears: 6, degree: "BSc Education" }
      }), "create application");
      log(`  application created ${app.id} (${subject.name} / ${topic.name})`);
    }

    if (!app.demoUploaded) {
      const seconds = Math.max(topic.minVideoSeconds ?? 30, 30);
      const up = await uploadVideo(`/api/v1/teacher-applications/${app.id}/demo`, token, app.version,
        { durationSeconds: seconds });
      must(up, "upload demo");
      log(`  teaching demo uploaded (${seconds}s)`);
      mine = must(await api("GET", "/api/v1/teacher-applications/mine", { token }), "applications");
      app = mine.find((a) => a.id === app.id);
    }

    if (app.status === APP.Draft) {
      must(await api("POST", `/api/v1/teacher-applications/${app.id}/submit`, {
        token, headers: { "If-Match": `"${app.version}"` }
      }), "submit application");
      log("  application submitted");
    }

    // 2. Quality Reviewer decision (real reviewer account, real endpoints) ------------------
    // The reviewer detail endpoint wraps the DTO: { application, reviews, ... }.
    const reviewerView = async () => {
      const r = must(await api("GET", `/api/v1/teacher-applications/${app.id}`, { token: reviewer }), "app detail");
      return r.application ?? r;
    };
    let detail = await reviewerView();
    if (detail.status === APP.Submitted) {
      must(await api("POST", `/api/v1/teacher-applications/${app.id}/start-review`, {
        token: reviewer, headers: { "If-Match": `"${detail.version}"` },
        body: { priority: detail.priority ?? 1 }
      }), "start review");
      detail = await reviewerView();
    }
    if (detail.status === APP.UnderReview) {
      must(await api("POST", `/api/v1/teacher-applications/${app.id}/decision`, {
        token: reviewer,
        headers: { "If-Match": `"${detail.version}"`, "Idempotency-Key": crypto.randomUUID() },
        body: {
          decision: APPROVE, scores: FULL_SCORES,
          comment: "Clear, well-structured explanation that meets the qualification bar.",
          internalNotes: "PASS 01 closure fixture."
        }
      }), "approve application");
      log("  application APPROVED by Quality Reviewer");
    }
  }

  // 3. Profile ------------------------------------------------------------------------------
  const profile = must(await api("GET", "/api/v1/teachers/me", { token }), "teacher profile");
  if (!profile.headline || !profile.bio) {
    must(await api("PUT", "/api/v1/teachers/me", {
      token,
      body: {
        headline, city, country: "Saudi Arabia", timeZoneId: "Asia/Riyadh", responseTimeMinutes: 120,
        bio: "Experienced tutor focused on step-by-step problem solving and exam technique."
      }
    }), "update profile");
    log("  profile completed");
  }

  const eligible = must(await api("GET", "/api/v1/teachers/me/eligible-subjects", { token }), "eligible subjects");
  if (!eligible.length) throw new Error(`${email} has no eligible subjects after approval`);
  const subjectId = eligible[0].id;

  const levels = must(await api("GET", "/api/v1/education-levels", { token }), "education levels");
  await api("PUT", "/api/v1/teachers/me/education-levels", { token, body: { educationLevelIds: [levels[0].id] } });
  const langs = must(await api("GET", "/api/v1/languages", { token }), "languages");
  if (Array.isArray(langs) && langs.length) {
    await api("PUT", "/api/v1/teachers/me/languages", {
      token, body: { languages: [{ languageId: langs[0].id, proficiency: "Native" }] }
    });
  }

  // 4. Service offering ----------------------------------------------------------------------
  // `me/marketplace-services` returns the CATALOG items with this teacher's own offerings nested
  // under `.offerings`; the offerings are what a student can actually request.
  const catalogFor = async () =>
    must(await api("GET", "/api/v1/teachers/me/marketplace-services", { token }), "my services");
  let catalogItems = await catalogFor();
  let offerings = catalogItems.flatMap((c) => c.offerings || []);

  if (!offerings.length) {
    const item = catalogItems.find(
      (c) => c.canEnable && (c.subjects || []).some((s) => s.id === subjectId)
    ) || catalogItems[0];
    must(await api("POST", "/api/v1/teachers/me/services", {
      token,
      // Title and description belong to the marketplace catalog — a Teacher may only set their
      // own approach, price, delivery time and revisions.
      body: {
        subjectId, serviceCatalogItemId: item.id, title: null, description: null,
        price, currency: "SAR",
        deliveryHours: item.defaultDeliveryHours ?? 48, revisions: item.defaultRevisions ?? 2,
        approachEn: serviceTitle, isAvailable: true
      }
    }), "create service");
    log(`  service offering created on "${item.nameEn}" (${price} SAR)`);
    catalogItems = await catalogFor();
    offerings = catalogItems.flatMap((c) => c.offerings || []);
  }
  const service = offerings[0];
  if (!service) throw new Error(`${email} has no service offering after creation`);
  await api("PUT", `/api/v1/teachers/me/services/${service.id}/active`, { token, body: { isActive: true } });

  // 5. Public teaching sample (required before publication) ------------------------------------
  const samplesBefore = await api("GET", "/api/v1/teachers/me", { token });
  const needsSample = !(samplesBefore.body.samples || []).length;
  if (needsSample) {
    const up = await uploadVideo("/api/v1/teachers/me/samples", token, null, {
      subjectId, title: "Worked example: solving step by step", durationSeconds: 60, isPublic: true
    });
    if (up.ok) {
      const sampleId = up.body?.id || up.body?.sampleId;
      if (sampleId) {
        await api("PUT", `/api/v1/teachers/me/samples/${sampleId}/publication`, { token, body: { isPublic: true } });
      }
      log("  public teaching sample uploaded");
    } else {
      log(`  sample upload skipped: ${up.status} ${JSON.stringify(up.body).slice(0, 160)}`);
    }
  }

  // 6. Publish ---------------------------------------------------------------------------------
  const pub = await api("PUT", "/api/v1/teachers/me/publication", { token, body: { published: true } });
  const status1 = must(await api("GET", "/api/v1/teachers/onboarding-status", { token }), "onboarding-status 2");
  log(`  publish -> ${pub.status}; published=${status1.isPublished} ` +
      `missing=${JSON.stringify(status1.missingRequirements)}`);
  return { token, teacherId: profile.teacherId, serviceId: service.id, published: status1.isPublished };
}

// ---------------------------------------------------------------------------------------------
/** Student request -> Teacher accept -> Order -> payment, so both dashboards have real rows. */
async function ensureOrder(teacher, studentEmail) {
  const student = await login(studentEmail);
  const existing = await api("GET", "/api/v1/learning-requests/mine?page=1&pageSize=20", { token: student });
  if (existing.ok && (existing.body.items || []).length) {
    log(`\n=== ORDER — student already has ${existing.body.items.length} request(s)/order(s), skipping creation`);
    return { student };
  }

  log("\n=== ORDER — creating canonical Student -> Teacher lifecycle");
  const req = must(await api("POST", "/api/v1/learning-requests", {
    token: student,
    body: {
      teacherServiceId: teacher.serviceId,
      title: "Quadratic equations — exam preparation walkthrough",
      description: "I need a clear step-by-step explanation of solving quadratics before my exam.",
      preferredDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      budget: 180
    }
  }), "create learning request");
  log(`  learning request created ${req.id}`);

  const assigned = must(await api("GET", "/api/v1/learning-requests/assigned?pageSize=50",
    { token: teacher.token }), "assigned requests");
  const match = (assigned.items || assigned).find((x) => x.id === req.id);
  if (!match) throw new Error("request did not reach the teacher's assigned queue");

  const accept = must(await api("POST", `/api/v1/learning-requests/${req.id}/accept`, {
    token: teacher.token,
    headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": `"${match.version}"` },
    body: {
      finalPrice: 180, currency: "SAR",
      agreedDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(), revisionAllowance: 2
    }
  }), "accept request");
  const orderId = accept.orderId || accept.id;
  log(`  order created ${orderId}`);

  const pay = await api("POST", `/api/v1/payments/orders/${orderId}`, {
    token: student, headers: { "Idempotency-Key": crypto.randomUUID() }, body: {}
  });
  log(`  payment init -> ${pay.status} ${JSON.stringify(pay.body).slice(0, 160)}`);
  return { student, orderId };
}

// ---------------------------------------------------------------------------------------------
/**
 * Browse comparison needs two published Teachers. Registration always requires an email
 * confirmation that Development cannot deliver (dummy Resend token), so the second Teacher is
 * created by granting the Teacher role to an existing confirmed UAT account through the real
 * Admin endpoint — the same call the Admin Users "Roles" checkboxes make. Tafseel's role model
 * explicitly supports multi-role accounts, so this is a supported product state, not a bypass.
 */
async function ensureTeacherRole(email) {
  const admin = await login("admin@gmail.com");
  const users = must(await api("GET", "/api/v1/admin/users?page=1&pageSize=50", { token: admin }), "admin users");
  const user = (users.items || []).find((u) => u.email === email);
  if (!user) throw new Error(`${email} not found in admin users`);
  if ((user.roles || []).includes("Teacher")) return;
  must(await api("PUT", `/api/v1/admin/users/${user.id}/roles`, {
    token: admin, body: { role: "Teacher", assigned: true }
  }), `grant Teacher role to ${email}`);
  log(`\n=== ROLE — Teacher granted to ${email} via Admin`);
  tokens.delete(email); // the role change invalidates existing sessions
}

const t1 = await ensurePublishedTeacher("teacher@gmail.com", {
  subjectName: "Mathematics", headline: "Mathematics tutor — algebra and exam technique",
  city: "Riyadh", serviceTitle: "Step-by-step algebra walkthroughs with exam technique", price: 180
});
await ensureOrder(t1, "student@gmail.com");

// NOT a "*.sprint02" UAT account: TeacherPublicQueries.BrowsableTeachers deliberately excludes
// any user whose display name contains "UAT" or "Sprint", so those accounts can never surface in
// the public marketplace. The seeded demo accounts carry ordinary names and are browsable.
const SECOND_TEACHER = "admin@gmail.com";
await ensureTeacherRole(SECOND_TEACHER);
const t2 = await ensurePublishedTeacher(SECOND_TEACHER, {
  subjectName: "Physics", headline: "Physics tutor — mechanics and problem solving",
  city: "Jeddah", serviceTitle: "Mechanics problem sets explained from first principles", price: 220
});

const published = must(await api("GET", "/api/v1/teachers?page=1&pageSize=20"), "public teachers");
log(`\nPUBLISHED TEACHERS DISCOVERABLE: ${(published.items || []).length}`);
log(`  t1 published=${t1.published}  t2 published=${t2.published}`);
log("\nFIXTURE COMPLETE");
