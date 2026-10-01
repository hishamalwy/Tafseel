/* Read-only access to a journey's throwaway database through sqlcmd.
 *
 * Locally this is LocalDB with Windows authentication; in CI it is the SQL Server service
 * container with SQL authentication. Set TAFSEEL_E2E_SQL_USER (and SQLCMDPASSWORD, which sqlcmd
 * reads itself, so the password never appears on a command line) to switch.
 *
 *   TAFSEEL_E2E_SQL_SERVER  default (localdb)\MSSQLLocalDB
 *   TAFSEEL_E2E_SQL_USER    optional SQL login; Windows authentication when unset
 *   SQLCMDPASSWORD          that login's password
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const SQL_SERVER = process.env.TAFSEEL_E2E_SQL_SERVER ?? '(localdb)\\MSSQLLocalDB';
const SQL_USER = process.env.TAFSEEL_E2E_SQL_USER ?? '';

export function sqlcmd() {
  const candidates = [
    'C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd.exe',
    'C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/180/Tools/Binn/sqlcmd.exe',
    '/opt/mssql-tools18/bin/sqlcmd',
    '/opt/mssql-tools/bin/sqlcmd'
  ];
  return candidates.find(existsSync) ?? 'sqlcmd';
}

/** Authentication and TLS arguments for the current environment. */
export function sqlAuth() {
  // -C trusts the server certificate: the CI container uses a self-signed one; LocalDB ignores it.
  return SQL_USER ? ['-U', SQL_USER, '-C'] : ['-E'];
}

/** Runs one query against `database` and returns trimmed text. Refuses anything that writes. */
export function readSql(database, query) {
  if (!/^TafseelE2E/i.test(database)) throw new Error('Set TAFSEEL_E2E_DATABASE to the throwaway TafseelE2E* database');
  if (/\b(insert|update|delete|merge|drop|alter|truncate|exec)\b/i.test(query)) throw new Error('Journeys only read the database');
  return execFileSync(sqlcmd(), ['-S', SQL_SERVER, ...sqlAuth(), '-d', database, '-b', '-h', '-1', '-W', '-Q', `SET NOCOUNT ON; ${query}`],
    { encoding: 'utf8' }).trim();
}

/**
 * Runs any statement and returns sqlcmd's raw output. Only the Wave 1 and Wave 2 journeys use it:
 * Wave 1 plants a stored notification to prove an old link still resolves.
 */
export function execSql(database, query) {
  if (!/^TafseelE2E/i.test(database)) throw new Error('Refusing to run against a database that is not TafseelE2E*');
  return execFileSync(sqlcmd(), ['-S', SQL_SERVER, ...sqlAuth(), '-d', database, '-b', '-h', '-1', '-W', '-Q', query],
    { encoding: 'utf8' });
}
