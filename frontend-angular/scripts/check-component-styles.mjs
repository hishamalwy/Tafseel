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
 * The Saudi Riyal mark must not depend on anything that might not arrive (UX-06).
 *
 * It used to be a webfont glyph revealed by `html.tf-riyal-font-ok`, a class nothing ever added, so every
 * price in the product fell back to the Latin letters "SAR" - inside Arabic sentences included. The mark is
 * now painted from artwork carried in the stylesheet itself. These four checks keep it that way: a future
 * edit that reintroduces a load-order gate, or drops the Arabic fallback, fails the build rather than
 * quietly changing what a price says.
 */
const design = readFileSync(fileURLToPath(new URL('../../css/tafseel.css', import.meta.url)), 'utf8')
  // Rules only: the comment above them is allowed to say what the old gate was.
  .replace(/\/\*[\s\S]*?\*\//g, '');
const riyalProblems = [
  design.includes('tf-riyal-font-ok') ? 'the mark is gated on a font-loaded class again' : null,
  design.includes("--riyal-mark:url('data:image/svg+xml") ? null : 'the inline mark artwork is missing',
  design.includes('mask:var(--riyal-mark)') ? null : 'nothing paints the mark',
  design.includes('html[lang="ar"] .tf-price-currency--mark::before') ? null
    : 'an Arabic page has no Arabic currency fallback'
].filter(Boolean);

if (riyalProblems.length) {
  console.error(['css/tafseel.css riyal mark:', ...riyalProblems.map(p => `- ${p}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log('Riyal mark is self-contained (no font gate, Arabic fallback present).');
}
