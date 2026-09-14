/**
 * Locate a legacy page by name, wherever it currently lives.
 *
 * Pages migrate to `frontend-angular/` one at a time, and a migrated page moves
 * to `legacy-archive/` rather than disappearing — it is still published and still
 * linked from the pages that have not moved yet. Without this, every migration
 * would mean hunting down the nine or so CI scripts that open pages by path.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [".", "legacy-archive"];

/** Absolute-ish path to a page, or null when it exists nowhere. */
export function findPage(name) {
  for (const root of ROOTS) {
    const candidate = join(root, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Read a page, failing loudly with somewhere to look rather than ENOENT. */
export function readPage(name) {
  const path = findPage(name);
  if (!path) {
    throw new Error(
      `Frontend page not found: ${name}. Looked in ${ROOTS.join(", ")}. ` +
      `If it was migrated and deleted, drop it from this check as well.`
    );
  }
  return readFileSync(path, "utf8");
}

/** Every legacy page still in the repository, migrated or not. */
export function allPages() {
  const seen = new Map();
  for (const root of ROOTS) {
    if (!existsSync(root)) continue;
    for (const file of readdirSync(root)) {
      if (file.endsWith(".dc.html") && !seen.has(file)) seen.set(file, join(root, file));
    }
  }
  return [...seen.entries()].map(([name, path]) => ({ name, path }));
}
