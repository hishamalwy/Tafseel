import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";

const require = createRequire(import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const guidedSource = readFileSync("js/guided-request.js", "utf8");
const sandbox = { window: {}, globalThis: {} };
vm.runInNewContext(guidedSource, sandbox);
const G = sandbox.window.TafseelGuidedRequest || sandbox.globalThis.TafseelGuidedRequest;
assert(G, "TafseelGuidedRequest must export");

// Composition
const composed = G.composeDescription({
  goal: "Understand Carnot",
  prompts: { concept: "entropy", stuck: "", scope: "one section" },
  promptOrder: ["concept", "stuck", "scope"],
  topicLabel: "Thermo",
  explanationStyle: "step_by_step",
  constraints: ""
}, {
  goal: "Goal",
  serviceDetails: "Service details",
  topic: "Topic",
  explanationPreference: "Explanation preference",
  additionalNotes: "Additional notes",
  prompt: { concept: "Concept", stuck: "Stuck", scope: "Scope" },
  style: { step_by_step: "Step by step" }
});
assert(composed.includes("Goal:\nUnderstand Carnot"), "goal section");
assert(composed.includes("- Concept: entropy"), "prompt line");
assert(!composed.includes("Stuck"), "empty prompt omitted");
assert(composed.includes("Topic:\nThermo"), "topic section");
assert(composed.includes("Explanation preference:\nStep by step"), "style section");
assert(!composed.includes("Additional notes"), "empty notes omitted");
const again = G.composeDescription({
  goal: "Understand Carnot",
  prompts: { concept: "entropy", stuck: "", scope: "one section" },
  promptOrder: ["concept", "stuck", "scope"],
  topicLabel: "Thermo",
  explanationStyle: "step_by_step",
  constraints: ""
}, {
  goal: "Goal",
  serviceDetails: "Service details",
  topic: "Topic",
  explanationPreference: "Explanation preference",
  additionalNotes: "Additional notes",
  prompt: { concept: "Concept", stuck: "Stuck", scope: "Scope" },
  style: { step_by_step: "Step by step" }
});
assert(composed === again, "composition is deterministic");

// Service prompts
assert(G.promptsForService("recorded_explanation").some(p => p.key === "concept" && p.required), "recorded prompts");
assert(G.promptsForService("assignment_guidance").some(p => p.key === "help_type"), "assignment prompts");
assert(G.promptsForService("exam_revision").some(p => p.key === "exam_date"), "exam prompts");
assert(G.promptsForService("unknown_code").length >= 1, "generic fallback");

// Scheduling vs requestable
assert(G.isSchedulingService({ requiresScheduling: true, canRequest: false, serviceCatalogCode: "live_session" }), "live scheduling");
assert(G.requestableServices([
  { id: "1", canRequest: true, requiresScheduling: false, serviceCatalogCode: "recorded_explanation" },
  { id: "2", canRequest: false, canBook: true, requiresScheduling: true, serviceCatalogCode: "live_session" }
]).length === 1, "only requestable services");

// Checklist
const items = G.checklist({
  teacherId: "t1",
  serviceId: "s1",
  subjectLabel: "Physics",
  title: "Title",
  goal: "Goal text",
  promptDefs: [{ key: "concept", required: true }],
  prompts: { concept: "entropy" },
  explanationStyle: "",
  deliveryDate: "2026-08-01",
  flexibleBudget: true,
  budget: 0,
  fileCount: 0
});
assert(G.requiredChecklistComplete(items), "required complete without style/files");
assert(items.some(i => i.id === "style" && i.kind === "recommended" && !i.done), "style recommended incomplete");
assert(items.some(i => i.id === "files" && i.kind === "recommended" && !i.done), "files recommended");

// Draft round-trip without secrets/bytes
const storage = new Map();
const fakeLocalStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k)
};
const draftSandbox = { window: { localStorage: fakeLocalStorage }, globalThis: { localStorage: fakeLocalStorage } };
vm.runInNewContext(guidedSource, draftSandbox);
const GD = draftSandbox.window.TafseelGuidedRequest;
GD.writeDraft("student-1", "teacher-1", {
  serviceId: "svc",
  step: 2,
  title: "T",
  goal: "G",
  explanationStyle: "detailed",
  prompts: { concept: "x" },
  deliveryDate: "2026-08-02",
  flexibleBudget: true,
  budget: 100,
  fileNames: ["notes.pdf"],
  agreed: false
});
const raw = storage.get(GD.draftKey("student-1", "teacher-1"));
assert(raw && !raw.includes("Bearer") && !raw.includes("accessToken"), "draft has no tokens");
assert(!raw.includes("%PDF"), "draft has no file bytes");
const restored = GD.readDraft("student-1", "teacher-1");
assert(restored.fileNames[0] === "notes.pdf", "file names reminder only");
assert(restored.explanationStyle === "detailed", "style restored");
GD.clearDraft("student-1", "teacher-1");
assert(GD.readDraft("student-1", "teacher-1") === null, "draft cleared");

// Page wiring
const page = readFileSync("Tafseel-Request.dc.html", "utf8");
assert(page.includes('src="js/guided-request.js"'), "page loads guided-request.js");
assert(page.includes("onSaveExit"), "Save & Exit wired");
assert(page.includes("uploaded.version") || page.includes("uploaded && uploaded.version"), "upload version chaining");
assert(page.includes("req_file_reselect_warning") || page.includes("fileReselectWarning"), "file reselect warning");
assert(page.includes("showSchedulingOnly"), "scheduling-only state");
assert(page.includes("missingTeacherId"), "teacher-required guard");
assert(page.includes("composeDescription") || page.includes("buildDescription"), "composition used");
assert(page.includes('role="radiogroup"'), "style/service radiogroup");
assert(page.includes("aria-current"), "progress aria-current");
assert(!/localStorage\.setItem\([^)]*accessToken|JWT|refresh/i.test(page), "no token persistence in page");
assert(page.includes("375") || page.includes("clamp(") || page.includes("minmax("), "responsive layout helpers present");

const student = readFileSync("Tafseel-Student-Dashboard.dc.html", "utf8");
assert(student.includes('href="Tafseel-Browse-Teachers.dc.html"') && student.includes("dash_new_request"),
  "Student Dashboard New request routes to Browse Teachers");
assert(!/href="Tafseel-Request\.dc\.html"/.test(student), "Student Dashboard must not open Request without Teacher");

console.log("Guided request checks passed.");
