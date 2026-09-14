// Gate: the Angular client must call routes, verbs and request bodies the API accepts.
//
//   node scripts/ci/check-api-contract.mjs            ratchet (CI): fail on any new violation, or on a
//                                                     known violation that no longer occurs
//   node scripts/ci/check-api-contract.mjs --strict   fail on any violation at all
//   node scripts/ci/check-api-contract.mjs --json     print the report as JSON
//
// Known violations are listed, with their remediation-matrix IDs, in
// tests/contracts/api-contract-known-violations.json. Fixing one means deleting its entry in the
// same change; the gate fails until that happens, so the list only shrinks.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContract, extractClientCalls, keyOf, loadContract } from './lib/api-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const strict = process.argv.includes('--strict');
const asJson = process.argv.includes('--json');

const contract = loadContract(root);
const client = extractClientCalls(root);
const { violations, matched, callShapes } = checkContract(contract, client, root);

const knownKeys = new Map(contract.known.violations.map(v => [keyOf(v), v]));
const currentKeys = new Set(violations.map(keyOf));
const unexpected = violations.filter(v => !knownKeys.has(keyOf(v)));
const resolved = contract.known.violations.filter(v => !currentKeys.has(keyOf(v)));
const report = { callShapes, matched, violations: violations.length, unexpected, resolved };

if (asJson) {
  console.log(JSON.stringify({ ...report, all: violations }, null, 2));
} else {
  console.log(`API contract: ${callShapes} client call shapes, ${matched} route matches, ${violations.length} violations`);
  for (const v of violations) {
    const known = knownKeys.get(keyOf(v));
    console.log(`  ${known ? `known ${known.matrix.padEnd(6)}` : 'NEW         '} ${v.kind.padEnd(22)} ${v.method.padEnd(6)} ${v.route}`);
    console.log(`  ${' '.repeat(12)} ${v.detail}  [${v.file}]`);
  }
  for (const v of resolved)
    console.log(`  RESOLVED ${v.matrix} ${v.kind} ${v.method} ${v.route}: remove it from tests/contracts/api-contract-known-violations.json`);
}

if (strict && violations.length) {
  console.error(`\n--strict: ${violations.length} violation(s).`);
  process.exit(1);
}
if (unexpected.length || resolved.length) {
  console.error(`\nContract gate failed: ${unexpected.length} new violation(s), ${resolved.length} known violation(s) no longer present.`);
  process.exit(1);
}
console.log(`\nContract gate passed with ${violations.length} known violation(s) tracked for remediation.`);
