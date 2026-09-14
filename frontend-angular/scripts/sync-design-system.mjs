/**
 * Build the design system into this project.
 *
 * `css/tafseel.css` and `assets/` are the hand-edited sources, and they sit at
 * the repository root because design-lab/ builds against the same files. Angular
 * refuses asset paths outside its workspace root, so this copies them in rather
 * than referencing them, splitting the landing chapters into their own lazy
 * bundle on the way. It runs before every build and test.
 */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, '..');
const repo = join(project, '..');

const assetsFrom = join(repo, 'assets');
const assetsTo = join(project, 'public', 'assets');
const cssFrom = join(repo, 'css', 'tafseel.css');
const cssTo = join(project, 'src', 'generated', 'tafseel.css');
const landingCssTo = join(project, 'src', 'app', 'features', 'landing', 'pages', 'landing-global.css');

for (const source of [assetsFrom, cssFrom]) {
  if (!existsSync(source)) {
    console.error(`sync-design-system: missing source ${source}`);
    process.exit(1);
  }
}

rmSync(assetsTo, { recursive: true, force: true });
mkdirSync(dirname(assetsTo), { recursive: true });
cpSync(assetsFrom, assetsTo, { recursive: true });
console.log(`synced ${assetsFrom} -> ${assetsTo}`);

/*
 * The stylesheet lives at `css/tafseel.css` and reaches its images as
 * `../assets/...`. Copied into `src/generated/`, that would resolve to a
 * `src/assets` that does not exist, and the bundler fails on every url().
 *
 * Rewriting them to server-absolute `/assets/...` points at the copied
 * `public/assets` output and stops the bundler trying to inline them. It does
 * assume the app is served from the domain root; if it ever moves under a
 * sub-path, this line and `<base href>` change together.
 */
const css = readFileSync(cssFrom, 'utf8').replaceAll('../assets/', '/assets/');
const sections = [
  ['LANDING - the chapters after the fold', 'Entry wizard — admin-published slots'],
  ['THE KINGDOM — landing map section', 'BRAND IDENTITY LAYER']
].map(([startLabel, endLabel]) => {
  const labelStart = css.indexOf(startLabel);
  const labelEnd = css.indexOf(endLabel, labelStart);
  const start = css.lastIndexOf('/*', labelStart);
  const end = css.lastIndexOf('/*', labelEnd);
  if (labelStart < 0 || labelEnd < 0 || start < 0 || end <= start) {
    throw new Error(`sync-design-system: could not extract ${startLabel}`);
  }
  return { start, end, content: css.slice(start, end).trim() };
});
const sharedCss = sections
  .toSorted((a, b) => b.start - a.start)
  .reduce((source, section) => source.slice(0, section.start) + source.slice(section.end), css);

rmSync(cssTo, { force: true });
mkdirSync(dirname(cssTo), { recursive: true });
writeFileSync(cssTo, sharedCss);
writeFileSync(landingCssTo, `/* Generated from css/tafseel.css by sync-design-system.mjs. */\n${sections.map(x => x.content).join('\n\n')}\n`);
const rewritten = (readFileSync(cssFrom, 'utf8').match(/\.\.\/assets\//g) ?? []).length;
console.log(`synced ${cssFrom} -> ${cssTo} + lazy landing CSS (${rewritten} asset urls rewritten)`);
