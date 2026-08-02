import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

for (const file of readdirSync("js").filter(x => x.endsWith(".js")))
  execFileSync(process.execPath, ["--check", join("js", file)], { stdio: "inherit" });

const support = readFileSync("support.js", "utf8");
const vendorScripts = new Map([
  ["js/vendor/react.production.min.js", "DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z"],
  ["js/vendor/react-dom.production.min.js", "gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1"],
  ["js/vendor/babel.min.js", "m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y"]
]);
if (support.includes("unpkg.com")) throw new Error("support.js must not load runtime scripts from unpkg.com");
for (const [file, expectedHash] of vendorScripts) {
  if (!existsSync(file)) throw new Error(`Missing vendored runtime: ${file}`);
  if (!support.includes(`./${file}`)) throw new Error(`support.js does not reference ${file}`);
  if (createHash("sha384").update(readFileSync(file)).digest("base64") !== expectedHash)
    throw new Error(`Vendored runtime hash mismatch: ${file}`);
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
execFileSync(process.execPath, ["--check", "support.js"], { stdio: "inherit" });

if (!existsSync("js/vendor/signalr.min.js"))
  throw new Error("Missing vendored SignalR client: js/vendor/signalr.min.js");
execFileSync(process.execPath, ["--check", "js/vendor/signalr.min.js"], { stdio: "inherit" });

for (const file of readdirSync(".").filter(x => x.endsWith(".dc.html"))) {
  const source = readFileSync(file, "utf8");
  const match = source.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!match) continue;
  const temp = join(tmpdir(), `${file}.check.js`);
  writeFileSync(temp, match[1]);
  try { execFileSync(process.execPath, ["--check", temp], { stdio: "inherit" }); }
  finally { unlinkSync(temp); }
}

execFileSync(process.execPath, ["scripts/ci/check-auth-ui.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-localization.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-frontend-integrity.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-guided-request.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-sprint6-notification-routing.mjs"], { stdio: "inherit" });
