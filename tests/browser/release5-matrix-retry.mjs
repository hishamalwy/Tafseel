import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, CREDENTIALS } from "./lib/auth.mjs";
import { loginOnceAndSave, openAuthedPage, closeAuthed } from "./lib/session.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release5-order-communication", "final-browser-certification");
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
};

const cells = [
  { role: "Teacher", dash: "Tafseel-Teacher-Dashboard.dc.html", section: "teacher-inbox", width: 768, height: 1024, lang: "ar", theme: "dark", label: "768_ar-dark" },
  { role: "Student", dash: "Tafseel-Student-Dashboard.dc.html", section: "student-inbox", width: 1440, height: 900, lang: "ar", theme: "dark", label: "1440_ar-dark" },
  { role: "Student", dash: "Tafseel-Student-Dashboard.dc.html", section: "student-inbox", width: 768, height: 1024, lang: "en", theme: "light", label: "768_en-light" },
  { role: "Teacher", dash: "Tafseel-Teacher-Dashboard.dc.html", section: "teacher-inbox", width: 768, height: 1024, lang: "en", theme: "light", label: "768_en-light" }
];

async function main() {
  if (!CREDENTIALS.Student.password || !CREDENTIALS.Teacher.password) throw new Error("UAT passwords missing");
  const conversationId = "bd26011f-5672-4ce1-b127-76afba29b3d3";
  const browser = await chromium.launch();
  try {
    await loginOnceAndSave(browser, "Student");
    await loginOnceAndSave(browser, "Teacher");
    await wait(20000);
    for (const cell of cells) {
      await wait(20000);
      const pack = await openAuthedPage(
        browser, cell.role,
        `${BASE_URL}/app/${cell.dash}?section=messages&conversationId=${conversationId}`,
        { viewport: { width: cell.width, height: cell.height }, theme: cell.theme, lang: cell.lang }
      );
      const status429 = [];
      const consoleErrors = [];
      pack.page.on("response", res => { if (res.status() === 429) status429.push(res.url()); });
      pack.page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      await wait(2500);
      await pack.page.waitForSelector(".tf-chat-widget[data-open=true] [data-r5-input]", { timeout: 20000 }).catch(() => {});
      const diag = await pack.page.evaluate(() => ({
        dir: document.documentElement.getAttribute("dir") || "",
        lang: document.documentElement.getAttribute("lang") || "",
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        missing: /⟦missing:/.test(document.body.innerText || ""),
        rawEnum: /ConversationScope|OrderStatus\./.test(document.body.innerText || "")
      }));
      const prefix = `${cell.section}-${cell.label}`;
      record(`${prefix}-dir`, cell.lang === "ar" ? diag.dir === "rtl" : diag.dir === "ltr", JSON.stringify(diag));
      record(`${prefix}-i18n`, !diag.missing && !diag.rawEnum, JSON.stringify(diag));
      record(`${prefix}-overflow`, !diag.overflow);
      record(`${prefix}-no-429`, status429.length === 0, JSON.stringify(status429));
      record(`${prefix}-no-console`, consoleErrors.length === 0, JSON.stringify(consoleErrors));
      await closeAuthed(pack);
    }
  } finally {
    await browser.close();
  }
  const finalPath = path.join(outDir, "release5-browser-final.json");
  const prior = JSON.parse(fs.readFileSync(finalPath, "utf8"));
  for (const row of results) {
    const idx = prior.results.findIndex(x => x.name === row.name);
    if (idx >= 0) prior.results[idx] = row;
    else prior.results.push(row);
  }
  prior.functional[15] = {
    id: 16,
    pass: prior.results.filter(r => /inbox-.*-i18n$/.test(r.name)).every(r => r.pass)
  };
  fs.writeFileSync(finalPath, JSON.stringify(prior, null, 2));
  fs.writeFileSync(path.join(outDir, "matrix-retry.json"), JSON.stringify(results, null, 2));
  const failed = results.filter(x => !x.pass);
  console.log(`matrix retry ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
