/**
 * Runs every browser business journey (tests/browser/*.e2e.mjs) the way SDLC Gate 5 asks: a
 * published build, in Development (dev email outbox, mock payment simulator), on a fresh database.
 *
 * Each journey gets its own throwaway TafseelE2E_* database and its own host process, so no journey
 * can pass or fail because of what another one left behind. The host migrates the database on
 * startup (Development), scripts/dev/E2ESeed seeds the people the journey needs, the journey runs,
 * then the host stops and the database is dropped.
 *
 *   node scripts/ci/run-browser-journeys.mjs --publish=<dir with Tafseel.Api.dll> --seed=<E2ESeed.dll>
 *     [--only=ux06,wave3b] [--port=5320] [--artifacts=<dir>]
 *
 * Environment:
 *   TAFSEEL_E2E_SQL_SERVER   default (localdb)\MSSQLLocalDB
 *   TAFSEEL_E2E_SQL_USER     optional SQL login (CI); Windows authentication when unset
 *   SQLCMDPASSWORD           that login's password
 *   TAFSEEL_E2E_PASSWORD     password for seeded accounts; generated when unset
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [key, ...value] = a.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));
const root = fileURLToPath(new URL('../..', import.meta.url));
const publish = resolve(args.publish ?? '');
const seedDll = resolve(args.seed ?? '');
if (!existsSync(join(publish, 'Tafseel.Api.dll'))) throw new Error('--publish must point at a published Tafseel.Api');
if (!existsSync(seedDll)) throw new Error('--seed must point at a built E2ESeed.dll');
const artifacts = resolve(args.artifacts ?? join(root, 'TestResults', 'browser-journeys'));
mkdirSync(artifacts, { recursive: true });

const sqlServer = process.env.TAFSEEL_E2E_SQL_SERVER ?? '(localdb)\\MSSQLLocalDB';
const sqlUser = process.env.TAFSEEL_E2E_SQL_USER ?? '';
const password = process.env.TAFSEEL_E2E_PASSWORD ?? `E2e!${randomBytes(9).toString('base64url')}`;
const signingKey = randomBytes(32).toString('base64url');
// DEC-04 payout destinations are sealed with this run's own random key; nothing is kept or committed.
const payoutKey = randomBytes(32).toString('base64');
const webhookSecret = randomBytes(32).toString('base64url');
const emailToken = randomBytes(24).toString('base64url');
const port = Number(args.port ?? 5320);
const base = `http://localhost:${port}`;

/** Which seed each journey expects (see each file's header). */
function scenarioFor(file) {
  if (file.startsWith('wave1-')) return null;
  if (file.startsWith('wave2-')) return '';
  if (file.startsWith('wave3a-')) return 'supply';
  return 'fulfilment';
}

const journeys = readdirSync(join(root, 'tests', 'browser'))
  .filter(f => f.endsWith('.e2e.mjs'))
  .filter(f => !args.only || args.only.split(',').some(pattern => f.includes(pattern)))
  .sort();
if (!journeys.length) throw new Error('No journeys matched');

function connectionString(database) {
  const auth = sqlUser
    ? `User Id=${sqlUser};Password=${process.env.SQLCMDPASSWORD ?? ''};Encrypt=True;TrustServerCertificate=True`
    : 'Trusted_Connection=True;TrustServerCertificate=True';
  return `Server=${sqlServer};Database=${database};${auth};MultipleActiveResultSets=false`;
}

function sqlcmd() {
  return ['C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd.exe',
    'C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/180/Tools/Binn/sqlcmd.exe',
    '/opt/mssql-tools18/bin/sqlcmd', '/opt/mssql-tools/bin/sqlcmd'].find(existsSync) ?? 'sqlcmd';
}

function dropDatabase(database) {
  const auth = sqlUser ? ['-U', sqlUser, '-C'] : ['-E'];
  const query = `IF DB_ID(N'${database}') IS NOT NULL BEGIN ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]; END`;
  try { execFileSync(sqlcmd(), ['-S', sqlServer, ...auth, '-d', 'master', '-b', '-Q', query], { stdio: 'pipe' }); }
  catch (error) { console.warn(`  could not drop ${database}: ${String(error.stderr ?? error.message).trim()}`); }
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  } else child.kill('SIGTERM');
}

async function waitForReady(child, logPath) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`host exited with ${child.exitCode}; see ${logPath}`);
    try {
      const response = await fetch(`${base}/health/ready`);
      if (response.ok) return;
    } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`host not ready within 240 s; see ${logPath}`);
}

function run(command, commandArgs, options) {
  return new Promise(resolvePromise => {
    const child = spawn(command, commandArgs, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    child.stdout.on('data', d => { out.push(d); options.log?.write(d); });
    child.stderr.on('data', d => options.log?.write(d));
    child.on('close', code => resolvePromise({ code, stdout: Buffer.concat(out).toString('utf8') }));
  });
}

const results = [];
const stamp = Date.now().toString(36);
for (const [index, journey] of journeys.entries()) {
  const name = journey.replace(/\.e2e\.mjs$/, '');
  const database = `TafseelE2E_${stamp}_${index}`;
  const log = createWriteStream(join(artifacts, `${name}.log`));
  const hostLog = createWriteStream(join(artifacts, `${name}.host.log`));
  const started = Date.now();
  let host;
  let outcome = 'failed';
  console.log(`\n▶ ${name} (database ${database})`);
  try {
    host = spawn('dotnet', [join(publish, 'Tafseel.Api.dll')], {
      cwd: publish,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        ASPNETCORE_URLS: base,
        ConnectionStrings__Tafseel: connectionString(database),
        Jwt__SigningKey: signingKey,
        Payments__WebhookSecret: webhookSecret,
        PayoutDestinations__ActiveKeyId: 'e2e',
        PayoutDestinations__Keys__e2e: payoutKey,
        Resend__ApiToken: emailToken,
        // Confirmation and reset emails must link back to this host: the journeys follow them.
        Email__ConfirmationUrl: `${base}/auth`,
        Email__PasswordResetUrl: `${base}/auth`,
        Email__AppBaseUrl: base,
        Cors__AllowedOrigins__0: base,
        // The journeys assert the mock meeting room. Development also reads the developer's User Secrets, which may
        // point live sessions at a real JaaS account; environment variables win, so the run stays deterministic.
        LiveSessions__Provider: 'Mock',
        JaaS__StaticJwt: '',
        // UX-05 verifies the reminder during the next one-minute worker scan.
        ...(journey.startsWith('ux05-') ? { OpenMarketplace__OfferReservationMinutes: '20' } : {})
      }
    });
    host.stdout.pipe(hostLog);
    host.stderr.pipe(hostLog);
    await waitForReady(host, join(artifacts, `${name}.host.log`));

    const env = {
      ...process.env,
      TAFSEEL_BASE_URL: base,
      TAFSEEL_E2E_DATABASE: database,
      TAFSEEL_E2E_SQL_SERVER: sqlServer,
      TAFSEEL_E2E_PASSWORD: password,
      TAFSEEL_DEV_OUTBOX: join(publish, 'App_Data', 'dev-outbox'),
      TAFSEEL_SHOT_DIR: join(artifacts, name)
    };
    mkdirSync(env.TAFSEEL_SHOT_DIR, { recursive: true });

    const scenario = scenarioFor(journey);
    if (scenario !== null) {
      const seeded = await run('dotnet', [seedDll], {
        env: { ...env, ConnectionStrings__Tafseel: connectionString(database), TAFSEEL_E2E_SCENARIO: scenario },
        log
      });
      const json = seeded.stdout.split(/\r?\n/).reverse().find(line => line.trim().startsWith('{'));
      if (seeded.code !== 0 || !json) throw new Error(`seed '${scenario || 'default'}' failed (exit ${seeded.code})`);
      env.TAFSEEL_E2E_SEED = join(artifacts, `${name}.seed.json`);
      writeFileSync(env.TAFSEEL_E2E_SEED, json);
    }

    const journeyRun = await run(process.execPath, [join('tests', 'browser', journey)], { cwd: root, env, log });
    outcome = journeyRun.code === 0 ? 'passed' : 'failed';
  } catch (error) {
    log.write(`\nRUNNER: ${error.stack ?? error}\n`);
    console.error(`  ${error.message}`);
  } finally {
    stop(host);
    await new Promise(r => setTimeout(r, 1500));
    dropDatabase(database);
    log.end();
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ name, outcome, seconds });
  console.log(`${outcome === 'passed' ? '✔' : '✘'} ${name} — ${outcome} in ${seconds}s (log: ${join(artifacts, `${name}.log`)})`);
}

const failed = results.filter(r => r.outcome !== 'passed');
const summary = ['| Journey | Result | Seconds |', '|---|---|---|',
  ...results.map(r => `| ${r.name} | ${r.outcome} | ${r.seconds} |`)].join('\n');
writeFileSync(join(artifacts, 'summary.md'), `${summary}\n`);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Browser journeys\n\n${summary}\n`, { flag: 'a' });
console.log(`\n${summary}\n\n${results.length - failed.length}/${results.length} journeys passed.`);
process.exit(failed.length ? 1 : 0);
