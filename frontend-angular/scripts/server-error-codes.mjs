// Every stable error `code` the API can put in a problem response, read from the server source so
// the list cannot drift: DomainException("code", "sentence"), ApiProblem.Create/WriteAsync(..., "code", ...)
// and the controllers' Error(status, "code", ...) helper. check-locales.mjs requires an `err_<code>`
// entry in both locale files for each one, so a reader never meets the server's English sentence.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = fileURLToPath(new URL('../../src/', import.meta.url));

function csharpFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ['bin', 'obj', 'Migrations'].includes(entry.name) ? [] : csharpFiles(path);
    return path.endsWith('.cs') ? [path] : [];
  });
}

const patterns = [
  /DomainException\(\s*"([a-z0-9_]+)"\s*,\s*(?:\$?"((?:[^"\\]|\\.)*)")?/g,
  /ApiProblem\.(?:Create|WriteAsync)\([^;]*?,\s*\d{3}\s*,\s*"([a-z0-9_]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g,
  /\bError\(\s*\d{3}\s*,\s*"([a-z0-9_]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g,
  /StatusCodes\.Status\d+\w*\s*,\s*"([a-z0-9_]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g
];

/** Map of code -> the server's English sentences for it (a code can be raised with several). */
export function serverErrorCodes() {
  const codes = new Map();
  for (const file of csharpFiles(serverRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns)
      for (const match of source.matchAll(pattern)) {
        const sentences = codes.get(match[1]) ?? new Set();
        if (match[2]) sentences.add(match[2]);
        codes.set(match[1], sentences);
      }
  }
  return codes;
}
