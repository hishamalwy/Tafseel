import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loginAs, BASE_URL, CREDENTIALS } from "./auth.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(here, "..", ".auth");
const NAV_GAP_MS = Number(process.env.TAFSEEL_AUTH_NAV_GAP_MS || 8000);
let lastAuthSensitiveAt = 0;

export function statePath(role) {
  return path.join(AUTH_DIR, `${role}.storage-state.json`);
}

export async function paceAuthSensitive() {
  const wait = lastAuthSensitiveAt + NAV_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastAuthSensitiveAt = Date.now();
}

export async function loginOnceAndSave(browser, role, options = {}) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  if (options.beforeLogin) await options.beforeLogin(page);
  await paceAuthSensitive();
  await loginAs(context, role, 1, page);
  await context.storageState({ path: statePath(role) });
  await page.close();
  await context.close();
  return statePath(role);
}

export async function persistContextState(context, role) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: statePath(role) });
}

export async function newAuthedContext(browser, role, options = {}) {
  const storage = statePath(role);
  if (!fs.existsSync(storage)) throw new Error(`Missing storageState for ${role}; loginOnceAndSave first`);
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    storageState: storage
  });
  if (options.theme || options.lang) {
    await context.addInitScript(({ theme, lang }) => {
      if (theme) localStorage.setItem("tafseel-theme", theme);
      if (lang) localStorage.setItem("tafseel-lang", lang);
    }, { theme: options.theme || "", lang: options.lang || "" });
  }
  return context;
}

export async function openAuthedPage(browser, role, url, options = {}) {
  const context = await newAuthedContext(browser, role, options);
  const page = await context.newPage();
  if (options.beforeGoto) await options.beforeGoto(page);
  await paceAuthSensitive();
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, { timeout: 25000 });
  return { context, page, role };
}

export async function closeAuthed(pack) {
  if (!pack) return;
  try { await persistContextState(pack.context, pack.role); } catch { /* ignore */ }
  try { await pack.page.close(); } catch { /* ignore */ }
  try { await pack.context.close(); } catch { /* ignore */ }
}

export function attachAuthBudget(page, bucket) {
  const hits = bucket || { refresh: 0, login: 0, negotiate: 0, status429: [] };
  page.on("request", req => {
    const url = req.url();
    if (url.includes("/api/v1/auth/refresh")) hits.refresh += 1;
    if (url.includes("/api/v1/auth/login")) hits.login += 1;
    if (url.includes("/hubs/messages/negotiate")) hits.negotiate += 1;
  });
  page.on("response", res => {
    if (res.status() === 429) hits.status429.push({ url: res.url(), method: res.request().method(), at: Date.now() });
  });
  return hits;
}

export { BASE_URL, CREDENTIALS };
