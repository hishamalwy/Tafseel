/**
 * Isolated Release publish smoke for R8.
 * Publishes to artifacts/r8-publish, boots briefly, checks health + key pages, stops.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const outDir = path.join(root, "artifacts", "r8-publish");
const port = 5092;
const base = `http://127.0.0.1:${port}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, shell: true, stdio: "inherit", ...opts });
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`)));
  });
}

async function get(url) {
  const res = await fetch(url);
  return { status: res.status, url };
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  await run("dotnet", ["publish", "src/Tafseel.Api/Tafseel.Api.csproj", "-c", "Release", "-o", outDir, "--nologo"]);

  const dll = path.join(outDir, "Tafseel.Api.dll");
  const child = spawn("dotnet", [dll], {
    cwd: outDir,
    shell: true,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: "Development",
      ASPNETCORE_URLS: base,
      SeedUsers__Enabled: "true",
      SeedUsers__Password: process.env.TAFSEEL_UAT_ADMIN_PASSWORD || "@Admin1234",
      SeedDemoData__Enabled: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let booted = false;
  for (let i = 0; i < 60; i++) {
    try {
      const live = await get(`${base}/health/live`);
      if (live.status === 200) { booted = true; break; }
    } catch { /* wait */ }
    await wait(1000);
  }
  if (!booted) {
    child.kill();
    throw new Error("publish smoke: failed to boot");
  }

  const checks = [
    "/health/live",
    "/health/ready",
    "/app/Tafseel-Landing.dc.html",
    "/app/Tafseel-Browse-Teachers.dc.html",
    "/app/Tafseel-Teacher-Profile.dc.html?id=c6f1d8af-ffb2-4cae-9dd7-73047f999c53",
    "/app/Tafseel-Auth.dc.html",
    "/app/Tafseel-Student-Dashboard.dc.html",
    "/app/Tafseel-Teacher-Dashboard.dc.html",
    "/app/Tafseel-Quality-Dashboard.dc.html",
    "/app/Tafseel-Admin-Dashboard.dc.html",
    "/app/css/tafseel.css",
    "/app/js/tafseel.js",
    "/app/js/boot-prefs.js",
    "/app/js/locales.js",
    "/app/assets/brand/tafseel-mark.png"
  ];

  const results = [];
  for (const pathName of checks) {
    const r = await get(`${base}${pathName}`);
    results.push(r);
    console.log(r.status, pathName);
  }

  child.kill();
  await wait(500);

  const failed = results.filter(r => r.status !== 200);
  const summary = {
    total: results.length,
    failed: failed.length,
    results,
    at: new Date().toISOString()
  };
  fs.mkdirSync(path.join(root, "docs", "features", "evidence", "phase4-release8-product-experience"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "features", "evidence", "phase4-release8-product-experience", "publish-smoke.json"),
    JSON.stringify(summary, null, 2)
  );
  if (failed.length) {
    console.error("PUBLISH_SMOKE_FAIL", failed);
    process.exit(1);
  }
  console.log("PUBLISH_SMOKE_PASS");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
