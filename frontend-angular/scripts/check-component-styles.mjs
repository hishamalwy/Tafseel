import { readdirSync, statSync } from 'node:fs';
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
