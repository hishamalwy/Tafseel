/**
 * Dependency vulnerability gate.
 *
 * `dotnet list package --vulnerable` prints advisories but always exits 0, so on its own it can
 * never turn a workflow red. This script runs it with `--format json`, and `npm audit --json`
 * for each npm project, and fails when any advisory is at or above the threshold.
 *
 *   node scripts/ci/check-vulnerable-packages.mjs              # NuGet + both npm projects, fail on high
 *   node scripts/ci/check-vulnerable-packages.mjs --min=critical
 *   node scripts/ci/check-vulnerable-packages.mjs --only=nuget  # or --only=npm
 *   --solution=<path> and --npm=<dir>,<dir> point the gate elsewhere (used to prove it fails).
 *
 * npm projects are audited without devDependencies: the build toolchain never ships to users.
 * Accepting a known advisory is done by upgrading, not by a list in this file.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const ORDER = ["low", "moderate", "high", "critical"];
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, "").split("=")));
const min = (args.min ?? "high").toLowerCase();
if (!ORDER.includes(min)) throw new Error(`--min must be one of ${ORDER.join(", ")}`);
const atOrAbove = severity => ORDER.indexOf(normalise(severity)) >= ORDER.indexOf(min);
const only = args.only;
const solution = args.solution ?? "Tafseel.sln";
const npmDirs = (args.npm ?? "frontend-angular,tests/browser").split(",").filter(Boolean);

const findings = [];

/** NuGet reports Low/Moderate/High/Critical; npm reports low/moderate/high/critical. */
function normalise(severity) {
  return String(severity ?? "").toLowerCase();
}

function run(command, commandArgs, cwd) {
  // npm is a .cmd shim on Windows, which Node only starts through a shell.
  const shell = process.platform === "win32" && command === "npm";
  try {
    return execFileSync(command, commandArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, shell });
  } catch (error) {
    // npm audit exits non-zero whenever it finds anything; its JSON is still on stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

if (only !== "npm") {
  const report = JSON.parse(run("dotnet", ["list", solution, "package", "--vulnerable", "--include-transitive", "--format", "json"]));
  for (const project of report.projects ?? [])
    for (const framework of project.frameworks ?? [])
      for (const kind of ["topLevelPackages", "transitivePackages"])
        for (const pkg of framework[kind] ?? [])
          for (const advisory of pkg.vulnerabilities ?? [])
            findings.push({
              source: "nuget",
              where: project.path.split(/[\\/]/).pop(),
              name: `${pkg.id} ${pkg.resolvedVersion}`,
              severity: normalise(advisory.severity),
              url: advisory.advisoryurl ?? ""
            });
}

if (only !== "nuget") {
  for (const dir of npmDirs) {
    if (!existsSync(`${dir}/package-lock.json`)) continue;
    const report = JSON.parse(run("npm", ["audit", "--omit=dev", "--json"], dir));
    for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {}))
      findings.push({
        source: "npm",
        where: dir,
        name: `${name} ${vuln.range ?? ""}`.trim(),
        severity: normalise(vuln.severity),
        url: (vuln.via ?? []).find(v => typeof v === "object")?.url ?? ""
      });
  }
}

const blocking = findings.filter(f => atOrAbove(f.severity));
for (const f of findings)
  console.log(`${atOrAbove(f.severity) ? "BLOCK" : "note "} [${f.source}] ${f.severity.padEnd(8)} ${f.name} (${f.where}) ${f.url}`);
console.log(`Dependency vulnerabilities: ${findings.length} reported, ${blocking.length} at or above ${min}.`);
if (blocking.length) process.exit(1);
