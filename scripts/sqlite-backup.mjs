import {
  chmodSync,
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

/**
 * SQLite creates a transactionally consistent standalone snapshot, including
 * committed WAL pages. A same-filesystem link publishes it without overwriting
 * a previous backup or a live database at the chosen destination.
 */
export function snapshot(source, destination) {
  const input = resolve(source);
  const output = resolve(destination);
  if (input === output) throw new Error('Choose a new path for the snapshot.');
  const dir = dirname(output);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(join(dir, '.leonida-snapshot-'));
  const temporary = join(staging, 'consistent.sqlite');
  try {
    const original = new DatabaseSync(input, { readOnly: true });
    try {
      original.exec('PRAGMA busy_timeout=10000');
      if (
        !original
          .prepare(
            "SELECT 1 AS present FROM sqlite_schema WHERE type='table' AND name='station_catalog'",
          )
          .get()
      ) {
        throw new Error('The source does not contain a LEONIDA FM catalog.');
      }
      original.prepare('VACUUM INTO ?').run(temporary);
    } finally {
      original.close();
    }
    chmodSync(temporary, 0o600);
    const copy = new DatabaseSync(temporary, { readOnly: true });
    try {
      const checks = copy.prepare('PRAGMA integrity_check').all();
      if (checks.length !== 1 || checks[0].integrity_check !== 'ok')
        throw new Error('Snapshot integrity check failed.');
    } finally {
      copy.close();
    }
    const handle = openSync(temporary, 'r');
    try {
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
    linkSync(temporary, output);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) {
    console.error('Usage: node scripts/sqlite-backup.mjs <existing-database> <new-snapshot>');
    process.exitCode = 2;
  } else {
    try {
      console.log('Verified snapshot:', basename(snapshot(process.argv[2], process.argv[3])));
    } catch (error) {
      console.error(
        error.code === 'EEXIST' ? 'Destination already exists. Choose a new file.' : error.message,
      );
      process.exitCode = 1;
    }
  }
}
