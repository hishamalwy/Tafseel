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
import postcss from 'postcss';

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
const sharedRoot = postcss.parse(sharedCss);
// Only rules whose every selector requires this feature's class can move.
// Keep mixed selectors and all keyframes in the common sheet; preserve media/supports wrappers.
function extractFeature(container, family) {
  const extracted = postcss.root();
  for (const node of [...(container.nodes ?? [])]) {
    // Functional pseudos can contain alternative or negated classes; their presence
    // does not prove the rule requires this feature (e.g. :is(.segment,.book-slot)).
    if (node.type === 'rule' && node.selectors.every(selector => !selector.includes('(') && family.test(selector))) {
      extracted.append(node.clone()); node.remove();
    } else if (node.type === 'atrule' && ['media','supports','layer','container'].includes(node.name)) {
      const children = extractFeature(node, family);
      if (children.nodes.length) {
        const wrapper = node.clone({nodes:[]}); children.nodes.forEach(child => wrapper.append(child.clone())); extracted.append(wrapper);
        if (!node.nodes.length) node.remove();
      }
    }
  }
  return extracted;
}
for (const [name, family] of [['teachers', /\.tf-mk(?:b)?(?:-|\b)/], ['booking', /\.tf-book(?:-|\b)/]]) {
  const feature = extractFeature(sharedRoot, family);
  if (!feature.nodes.length) throw new Error(`No ${name} feature styles extracted`);
  writeFileSync(join(project,'src','generated',`${name}.css`), `/* Generated feature-only rules from css/tafseel.css. */\n${feature.toString()}\n`);
  console.log(`${name}: ${feature.nodes.length} rule groups loaded with its lazy pages`);
}
writeFileSync(cssTo, sharedRoot.toString());
const landingCss = `/* Generated from css/tafseel.css by sync-design-system.mjs. */\n${sections.map(x => x.content).join('\n\n')}\n`;
if (!existsSync(landingCssTo) || readFileSync(landingCssTo, 'utf8') !== landingCss)
  writeFileSync(landingCssTo, landingCss);
const rewritten = (readFileSync(cssFrom, 'utf8').match(/\.\.\/assets\//g) ?? []).length;
console.log(`synced ${cssFrom} -> ${cssTo} + lazy landing CSS (${rewritten} asset urls rewritten)`);
