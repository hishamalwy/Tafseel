import { existsSync, readFileSync, readdirSync } from "node:fs";

const pages = readdirSync(".").filter(x => x.endsWith(".dc.html"));

for (const page of pages) {
  const source = readFileSync(page, "utf8");
  const markup = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  if (/href\s*=\s*["']#["']/.test(markup))
    throw new Error(`${page} has a dead href="#" link — wire it to a real destination or remove it.`);
  if (/javascript:void\(0\)/i.test(markup))
    throw new Error(`${page} has a javascript:void(0) placeholder link.`);

  for (const match of markup.matchAll(/href\s*=\s*["'](Tafseel-[\w-]+\.dc\.html)["']/g)) {
    if (!existsSync(match[1]))
      throw new Error(`${page} links to missing page: ${match[1]}`);
  }
}

console.log(`Frontend integrity validation passed for ${pages.length} entry points.`);
