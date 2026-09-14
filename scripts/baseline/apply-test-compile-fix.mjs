// Makes the stale test projects compile, in a DISPOSABLE copy of the tree only.
//
//   node apply-test-compile-fix.mjs <copyRoot> <integrationBuildLog>
//
// 1. TeacherProfile.Publish(now) became Publish(TeacherProfileReadiness, now). Every call
//    site the compiler reports (CS7036) gets an explicit ready readiness. Mechanical.
// 2. Two LiveSessionTests methods assert the lifecycle before mutual settlement
//    (Reschedule/Complete no longer exist; no-show now goes through *Pending). They are
//    fenced out with #if, not rewritten - rewriting them is remediation, not baseline.
//
// Refuses to touch the repository this script lives in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [copyRoot, logPath] = process.argv.slice(2);
if (!copyRoot || !logPath) throw new Error('usage: apply-test-compile-fix.mjs <copyRoot> <integrationBuildLog>');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
if (path.resolve(copyRoot).toLowerCase().startsWith(repoRoot.toLowerCase()))
  throw new Error(`refusing to patch inside the repository (${repoRoot}); pass a disposable copy`);

const log = fs.readFileSync(logPath, 'utf8');
const byFile = {};
for (const [, file, line] of log.matchAll(/IntegrationTests[\\/]([\w.]+\.cs)\((\d+),\d+\): error CS7036/g))
  (byFile[file] ??= new Set()).add(Number(line));

let patched = 0;
for (const [file, lines] of Object.entries(byFile)) {
  const target = path.join(copyRoot, 'tests', 'Tafseel.IntegrationTests', file);
  const source = fs.readFileSync(target, 'utf8').split('\n');
  for (const line of lines) {
    const before = source[line - 1];
    source[line - 1] = before.replace('.Publish(', '.Publish(new Tafseel.Domain.Marketplace.TeacherProfileReadiness(true), ');
    if (before === source[line - 1]) throw new Error(`no Publish( call at ${file}:${line}`);
    patched++;
  }
  fs.writeFileSync(target, source.join('\n'));
}
console.log(`integration call sites patched: ${patched}`);

const domain = path.join(copyRoot, 'tests', 'Tafseel.Domain.Tests', 'LiveSessionTests.cs');
let text = fs.readFileSync(domain, 'utf8');
if (!/\.(Reschedule|Complete)\(/.test(text)) {
  console.log('domain LiveSessionTests already use the settlement lifecycle; nothing to fence');
  process.exit(0);
}
for (const name of [
  'Payment_reschedule_cancel_and_terminal_rules_are_explicit',
  'Completion_and_no_show_wait_until_session_end_and_enforce_actor',
]) {
  const at = text.search(new RegExp(`\\[Fact\\]\\s*\\r?\\n\\s*public void ${name}`));
  if (at < 0) { console.log(`not found (already fixed?): ${name}`); continue; }
  const start = text.lastIndexOf('\n', at) + 1;
  const end = text.indexOf('\n    }', at) + '\n    }'.length;
  text = `${text.slice(0, start)}#if STALE_PRE_SETTLEMENT_LIFECYCLE\n${text.slice(start, end)}\n#endif${text.slice(end)}`;
  console.log(`fenced stale domain test: ${name}`);
}
fs.writeFileSync(domain, text);
