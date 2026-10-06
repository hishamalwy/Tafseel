import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/app/', import.meta.url));
const limit = 12 * 1024;

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : extname(path) === '.css' ? [path] : [];
  });
}

const oversized = files(root)
  .filter(path => !path.endsWith('landing-global.css') && statSync(path).size > limit)
  .map(path => `${relative(root, path)} (${statSync(path).size} bytes)`);

if (oversized.length) {
  console.error(`Component CSS exceeded 12 KiB:\n${oversized.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Component style budget passed (12 KiB; lazy landing bundle excluded).');
}


/*
 * The Saudi Riyal mark is U+20C1 from the self-hosted saudi_riyal face, in both languages.
 * It used to be gated on `html.tf-riyal-font-ok` (never set) or painted as an SVG mask with
 * "SAR" / "31.33" fallbacks. These checks keep the official glyph on every price.
 */
const design = readFileSync(fileURLToPath(new URL('../../css/tafseel.css', import.meta.url)), 'utf8')
  // Rules only: the comment above them is allowed to say what the old gate was.
  .replace(/\/\*[\s\S]*?\*\//g, '');
const riyalProblems = [
  design.includes('tf-riyal-font-ok') ? 'the mark is gated on a font-loaded class again' : null,
  design.includes("font-family:'saudi_riyal'") ? null : 'the saudi_riyal face is missing from the mark',
  /content:"\\20C1"/.test(design) ? null : 'the mark is not the official U+20C1 glyph',
  /content:"SAR"/.test(design) ? 'the mark still falls back to the letters SAR' : null,
  /content:"31\.33"/.test(design) ? 'the Arabic mark still falls back to 31.33' : null,
  // UX-06: every text field and select is a 44px target; they were 42px, a thumb's width short of it.
  /\.tf-field select\{\s*height:44px;\s*min-height:44px;/.test(design) ? null
    : 'form fields are no longer 44px tall'
].filter(Boolean);

if (riyalProblems.length) {
  console.error(['css/tafseel.css UX-06 guards:', ...riyalProblems.map(p => `- ${p}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log('UX-06 guards passed (official riyal glyph, 44px form fields).');
}

/**
 * Every screen with a <main> starts with a skip link pointing at that main's id (WCAG 2.4.1).
 * Signed-in screens used to have none, so a keyboard reader tabbed through the whole sidebar
 * on every page. The auth shell is exempt: its <main> is the first element on the page.
 */
function templates(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return templates(path);
    if (path.endsWith('.component.html')) return [path];
    return path.endsWith('.component.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}
const skipProblems = [];
for (const path of templates(root)) {
  const text = readFileSync(path, 'utf8');
  // A .ts file counts only through its inline template, never its comments or strings.
  const source = path.endsWith('.ts') ? (text.match(/template:\s*`([\s\S]*?)`/)?.[1] ?? '') : text;
  const main = source.match(/<main\b[^>]*>/);
  if (!main || relative(root, path).split(/[\\/]/).join('/') === 'shared/layouts/auth-shell.component.ts') continue;
  const id = main[0].match(/\bid="([^"]+)"/)?.[1];
  const link = source.match(/<tf-skip-link\b[^>]*>/);
  const target = link?.[0].match(/\btarget="([^"]+)"/)?.[1] ?? 'main';
  if (!link) skipProblems.push(`${relative(root, path)}: <main> without a <tf-skip-link>`);
  else if (id !== target) skipProblems.push(`${relative(root, path)}: skip link targets #${target} but <main> has id "${id ?? ''}"`);
  else if (source.indexOf(link[0]) > source.indexOf(main[0])) skipProblems.push(`${relative(root, path)}: skip link comes after <main>`);
}
if (skipProblems.length) {
  console.error(['Skip-link guard:', ...skipProblems.map(p => `- ${p}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log('Skip-link guard passed (every <main> is reachable from a leading skip link).');
}

/*
 * DESIGN.md, Typography Roles and Motion: component styles size type by role, never by pixel;
 * every :hover sits under (hover:hover) so a tap never leaves a card lifted on a phone; and the
 * tokens live in one :root and one dark block instead of a second :root further down the file.
 */
const componentStyles = [
  ...files(root).filter(path => !path.endsWith('landing-global.css')),
  ...templates(root).filter(path => path.endsWith('.ts'))
];
const rawType = componentStyles.flatMap(path =>
  [...readFileSync(path, 'utf8').matchAll(/font-size:\s*[0-9.]+px/g)].map(() => relative(root, path)));

/** Every rule whose selector names :hover but is not nested in a hover media query. */
function ungatedHover(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  const found = [];
  let prelude = '';
  for (const ch of source) {
    if (ch === '{') {
      const head = prelude.trim();
      if (head.includes(':hover') && !head.startsWith('@') && !stack.some(s => /hover\s*:\s*hover/.test(s)))
        found.push(head.split('\n').pop().slice(0, 80));
      stack.push(head);
      prelude = '';
    } else if (ch === '}') {
      stack.pop();
      prelude = '';
    } else if (ch === ';' && stack.length && !stack[stack.length - 1].startsWith('@')) {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return found;
}
const hoverProblems = [
  ...ungatedHover(readFileSync(fileURLToPath(new URL('../../css/tafseel.css', import.meta.url)), 'utf8'))
    .map(rule => `css/tafseel.css: ${rule}`),
  ...files(root).filter(path => !path.endsWith('landing-global.css'))
    .flatMap(path => ungatedHover(readFileSync(path, 'utf8')).map(rule => `${relative(root, path)}: ${rule}`))
];
const tokenBlocks = {
  ':root': (design.match(/^:root\s*\{/gm) ?? []).length,
  'html[data-theme="dark"]': (design.match(/^html\[data-theme="dark"\]\s*\{/gm) ?? []).length
};
const systemProblems = [
  ...[...new Set(rawType)].map(path => `${path}: raw px font-size; use var(--type-<role>-size)`),
  ...hoverProblems.map(rule => `${rule} — :hover outside @media (hover:hover) and (pointer:fine)`),
  ...Object.entries(tokenBlocks).filter(([, n]) => n !== 1)
    .map(([selector, n]) => `css/tafseel.css has ${n} top-level ${selector} blocks; keep one`)
];
if (systemProblems.length) {
  console.error(['Design-system guard:', ...systemProblems.map(p => `- ${p}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log('Design-system guard passed (type roles, pointer-only hover, one token block per theme).');
}
