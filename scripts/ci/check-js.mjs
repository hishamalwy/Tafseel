/**
 * JavaScript and shipping-client checks (G-14).
 *
 * The site is the Angular client in frontend-angular/, published per locale from
 * frontend-angular/dist/tafseel/browser/{ar,en}. The retired .dc.html runtime - its pages,
 * support.js, and Babel/React loaded in the browser - is gone, and this script makes sure it
 * stays gone and that what replaced it is complete.
 *
 *  1. Syntax: every tracked hand-written .js/.mjs/.cjs file parses.
 *  2. Build output: both locale shells exist with the right <base href> and every file they
 *     reference; the prerendered pages exist; no emitted script relies on eval, which the
 *     host's Content-Security-Policy no longer allows.
 *  3. The legacy runtime is not back.
 *
 * Run after the client is built (`dotnet build` builds it; so does `npm run build`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const failures = [];
const fail = message => failures.push(message);

// ---- 1. syntax -------------------------------------------------------------------------
const tracked = sourceFiles();
for (const file of tracked) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    fail(`${file} does not parse:\n${error.stderr?.toString() ?? error.message}`);
  }
}

// ---- 2. the shipping client ------------------------------------------------------------
const browser = join("frontend-angular", "dist", "tafseel", "browser");
const locales = ["ar", "en"];
const policies = [...readFileSync("frontend-angular/src/app/features/policies/models/policy.ts", "utf8")
  .match(/POLICY_ORDER[^=]*=\s*\[([^\]]*)\]/)?.[1].matchAll(/'([a-z-]+)'/g) ?? []].map(m => m[1]);
if (policies.length === 0) fail("Could not read POLICY_ORDER from policy.ts");

if (!existsSync(browser)) {
  fail(`${browser} does not exist. Build the client first (dotnet build, or npm run build in frontend-angular).`);
} else {
  for (const locale of locales) {
    const root = join(browser, locale);
    const shellPath = join(root, "index.csr.html");
    if (!existsSync(shellPath)) { fail(`Missing client shell ${shellPath}`); continue; }
    const shell = readFileSync(shellPath, "utf8");
    if (!new RegExp(`<base href="/${locale}/"\\s*/?>`).test(shell)) fail(`${shellPath} must carry <base href="/${locale}/">`);
    if (!shell.includes("<tf-root")) fail(`${shellPath} has no <tf-root> element`);

    const referenced = [...shell.matchAll(/\s(?:src|href)="([^"#:]+)"/g)].map(m => m[1])
      .filter(ref => !ref.startsWith("/") && !ref.startsWith("//"));
    for (const ref of referenced) {
      if (!existsSync(join(root, ref.split("?")[0]))) fail(`${shellPath} references ${ref}, which the build did not emit`);
    }
    for (const needed of ["main-", "polyfills-", "styles-"]) {
      if (!referenced.some(ref => ref.startsWith(needed))) fail(`${shellPath} does not load its ${needed}* bundle`);
    }

    const prerendered = ["about", ...policies.map(p => `policies/${p}`)];
    for (const page of prerendered) {
      const file = join(root, page, "index.html");
      if (!existsSync(file)) fail(`Missing prerendered page ${file}`);
      else if (!new RegExp(`<base href="/${locale}/"\\s*/?>`).test(readFileSync(file, "utf8"))) fail(`${file} has the wrong <base href>`);
    }

    for (const file of walk(root).filter(f => extname(f) === ".js")) {
      const source = readFileSync(file, "utf8");
      if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(source))
        fail(`${file} uses eval or new Function, which script-src without 'unsafe-eval' blocks`);
    }
  }

  // The emitted bundles are ES modules; check one parses as a module so a broken build is caught
  // here and not in a browser.
  const main = readdirSync(join(browser, "en")).find(f => /^main-.*\.js$/.test(f));
  if (main) {
    const dir = mkdtempSync(join(tmpdir(), "tafseel-check-"));
    const copy = join(dir, "main.mjs");
    writeFileSync(copy, readFileSync(join(browser, "en", main)));
    try { execFileSync(process.execPath, ["--check", copy], { stdio: "pipe" }); }
    catch (error) { fail(`Emitted ${main} does not parse as a module:\n${error.stderr?.toString() ?? error.message}`); }
    finally { unlinkSync(copy); }
  }
}

// `(ngSubmit)` is emitted by NgForm. A standalone component that binds it without importing
// FormsModule gets a native submit instead: the page reloads and the handler never runs, which
// is how sign-in, sign-up and password reset were all silently broken.
for (const template of walk(join("frontend-angular", "src", "app")).filter(f => f.endsWith(".html"))) {
  if (!readFileSync(template, "utf8").includes("(ngSubmit)")) continue;
  const component = template.replace(/\.html$/, ".ts");
  const source = existsSync(component) ? readFileSync(component, "utf8") : "";
  if (!/\b(FormsModule|ReactiveFormsModule)\b/.test(source))
    fail(`${template} binds (ngSubmit) but ${component} does not import FormsModule; the form would reload the page`);
}

// ---- 3. the legacy runtime stays retired (R-05) ---------------------------------------
for (const retired of ["support.js", "legacy-archive", "js/vendor", "js/api.js", "js/tafseel.js"]) {
  if (existsSync(retired)) fail(`${retired} belongs to the retired .dc.html runtime and must not return`);
}
const rootPages = readdirSync(".").filter(f => f.endsWith(".dc.html"));
if (rootPages.length) fail(`Legacy pages are back at the repository root: ${rootPages.join(", ")}`);
const program = readFileSync("src/Tafseel.Api/Program.cs", "utf8");
if (program.includes("unsafe-eval")) fail("Program.cs must not allow 'unsafe-eval' in the Content-Security-Policy");
if (/\.dc\.html"\s*,/.test(program)) fail("Program.cs must not serve .dc.html pages");
const project = readFileSync("src/Tafseel.Api/Tafseel.Api.csproj", "utf8");
if (/dc\.html|support\.js|Link>frontend\\/.test(project)) fail("Tafseel.Api.csproj must not publish the legacy frontend/ content");

if (failures.length) {
  console.error(failures.map(x => `✗ ${x}`).join("\n"));
  process.exit(1);
}
console.log(`JavaScript checks passed: ${tracked.length} source files parse; ${locales.length} locale shells, ` +
  `${1 + policies.length} prerendered pages each; no eval; legacy runtime absent.`);

/** Tracked JS files; outside a git checkout (an exported tree), the same set found on disk. */
function sourceFiles() {
  try {
    return execFileSync("git", ["ls-files", "*.js", "*.mjs", "*.cjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n").map(x => x.trim()).filter(Boolean).filter(existsSync);
  } catch {
    const skip = new Set(["node_modules", "dist", ".angular", "bin", "obj", ".git", "artifacts", "generated"]);
    const found = [];
    const visit = dir => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { if (!skip.has(entry.name)) visit(path); }
        else if (/\.(c|m)?js$/.test(entry.name)) found.push(path);
      }
    };
    for (const root of ["scripts", "js", "tests/browser", "frontend-angular/scripts"]) if (existsSync(root)) visit(root);
    return found;
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
