import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/app/', import.meta.url));
const localeRoot = new URL('../public/locale/', import.meta.url);
const callPattern = /\b(?:this\.|locale\.)?t\(\s*'([^']+)'\s*,\s*'([^']*)'/g;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.html'].includes(extname(path)) && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

// A key does not have to appear inside a `t(...)` call to be translated: the
// dashboards keep theirs in data (`labelKey`/`titleKey` on DASHBOARDS) and hand
// them to `t()` at render time. Scanning only call sites is what let every
// dashboard nav label ship untranslated, so both shapes are collected.
const keyPropertyPattern = /\b(?:label|title)Key:\s*'([^']+)'/g;
// `tab()`/`area()` default their labelKey to `dash_${key}` from the first
// argument, so the key exists in no literal anywhere.
const derivedPattern = /\b(?:tab|area)\(\s*'([A-Za-z][A-Za-z0-9]*)'/g;

const used = new Map();
for (const file of sourceFiles(root)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(callPattern)) {
    const [, key, fallback] = match;
    if (!used.has(key)) used.set(key, { fallback, file });
  }
  for (const match of source.matchAll(keyPropertyPattern))
    if (!used.has(match[1])) used.set(match[1], { fallback: '', file });
  if (file.endsWith(join('dashboards', 'models', 'dashboard.ts')))
    for (const match of source.matchAll(derivedPattern))
      if (!used.has(`dash_${match[1]}`)) used.set(`dash_${match[1]}`, { fallback: '', file });
}

const locales = Object.fromEntries(['en', 'ar'].map(lang => [
  lang,
  JSON.parse(readFileSync(new URL(`${lang}.json`, localeRoot), 'utf8'))
]));
const missing = Object.fromEntries(Object.entries(locales).map(([lang, table]) => [
  lang,
  [...used.keys()].filter(key => !(key in table))
]));

if (missing.en.length || missing.ar.length) {
  for (const lang of ['en', 'ar']) {
    if (missing[lang].length) console.error(`${lang}: missing ${missing[lang].length} keys\n${missing[lang].join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Angular locale coverage passed (${used.size} keys in en/ar).`);
}
