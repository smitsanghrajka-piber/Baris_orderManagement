#!/usr/bin/env node
/**
 * Project-local PostgreSQL cluster for development — kept separate from any
 * system Postgres so it needs no admin rights or shared passwords.
 *
 *   node scripts/local-db.js init     create .pgdata, the dev + test databases,
 *                                     and write the URLs into .env
 *   node scripts/local-db.js start    start the cluster (port LOCAL_DB_PORT, default 5433)
 *   node scripts/local-db.js stop
 *   node scripts/local-db.js status
 *
 * Postgres binaries are taken from PG_BIN, else the first
 * C:\Program Files\PostgreSQL\<version>\bin found, else PATH.
 */
const { spawnSync } = require('child_process');
const { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } = require('fs');
const { join } = require('path');
const { randomBytes } = require('crypto');
const os = require('os');

const ROOT = join(__dirname, '..');
const DATA = join(ROOT, '.pgdata');
const LOG = join(DATA, 'server.log');
const ENV = join(ROOT, '.env');
const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
const DB = 'baris_om';
const TEST_DB = 'baris_om_test';

function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const base = 'C:\\Program Files\\PostgreSQL';
  if (process.platform === 'win32' && existsSync(base)) {
    const versions = readdirSync(base).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
    for (const v of versions) if (existsSync(join(base, v, 'bin', 'pg_ctl.exe'))) return join(base, v, 'bin');
  }
  return '';
}

function run(tool, args, opts = {}) {
  const bin = pgBin();
  const r = spawnSync(bin ? join(bin, tool) : tool, args, { stdio: opts.stdio ?? 'inherit', env: { ...process.env, ...opts.env } });
  if (r.error) throw r.error;
  return r.status;
}

const isRunning = () => run('pg_isready', ['-h', '127.0.0.1', '-p', String(PORT)], { stdio: 'ignore' }) === 0;

function start() {
  if (!existsSync(DATA)) throw new Error('No .pgdata yet — run `npm run db:init` first.');
  if (isRunning()) return console.log(`Local Postgres already running on ${PORT}.`);
  // stdio ignored: on Windows the postmaster otherwise inherits and holds the caller's pipes.
  const code = run('pg_ctl', ['-D', DATA, '-l', LOG, '-w', '-o', `-p ${PORT} -c listen_addresses=127.0.0.1`, 'start'], { stdio: 'ignore' });
  if (code !== 0) throw new Error(`pg_ctl start failed — see ${LOG}`);
  console.log(`Local Postgres running on 127.0.0.1:${PORT}.`);
}

function stop() {
  if (!isRunning()) return console.log('Local Postgres is not running.');
  run('pg_ctl', ['-D', DATA, '-w', 'stop'], { stdio: 'ignore' });
  console.log('Local Postgres stopped.');
}

function setEnvVar(text, key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

function init() {
  if (existsSync(DATA)) throw new Error('.pgdata already exists — delete it to start over.');
  const password = randomBytes(18).toString('base64url');
  const tmp = mkdtempSync(join(os.tmpdir(), 'pgpw-'));
  const pwFile = join(tmp, 'pw');
  writeFileSync(pwFile, password);
  try {
    const code = run('initdb', ['-D', DATA, '-U', 'postgres', '-A', 'scram-sha-256', '--pwfile', pwFile, '-E', 'UTF8', '--no-locale'], { stdio: 'ignore' });
    if (code !== 0) throw new Error('initdb failed');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  start();
  for (const db of [DB, TEST_DB]) {
    run('createdb', ['-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', db], { env: { PGPASSWORD: password } });
  }
  const url = (db) => `postgresql://postgres:${password}@127.0.0.1:${PORT}/${db}?schema=public`;
  let env = existsSync(ENV) ? readFileSync(ENV, 'utf8') : readFileSync(join(ROOT, '.env.example'), 'utf8');
  env = setEnvVar(env, 'DATABASE_URL', url(DB));
  env = setEnvVar(env, 'DIRECT_URL', url(DB));
  env = setEnvVar(env, 'DATABASE_URL_TEST', url(TEST_DB));
  env = setEnvVar(env, 'DIRECT_URL_TEST', url(TEST_DB));
  writeFileSync(ENV, env);
  console.log(`Created databases ${DB} and ${TEST_DB}; connection URLs written to .env.`);
}

const commands = { init, start, stop, status: () => console.log(isRunning() ? `Running on ${PORT}.` : 'Not running.') };
const cmd = commands[process.argv[2]];
if (!cmd) {
  console.error('Usage: node scripts/local-db.js <init|start|stop|status>');
  process.exit(1);
}
try {
  cmd();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
