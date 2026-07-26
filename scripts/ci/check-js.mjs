import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

for (const file of readdirSync("js").filter(x => x.endsWith(".js")))
  execFileSync(process.execPath, ["--check", join("js", file)], { stdio: "inherit" });

for (const file of readdirSync(".").filter(x => x.endsWith(".dc.html"))) {
  const source = readFileSync(file, "utf8");
  const match = source.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!match) continue;
  const temp = join(tmpdir(), `${file}.check.js`);
  writeFileSync(temp, match[1]);
  try { execFileSync(process.execPath, ["--check", temp], { stdio: "inherit" }); }
  finally { unlinkSync(temp); }
}
