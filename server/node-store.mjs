import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSqlStore } from './store.mjs';

export function createNodeStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  return createSqlStore({
    first: (sql, args) => db.prepare(sql).get(...args),
    all: (sql, args) => db.prepare(sql).all(...args),
    run: (sql, args) => Number(db.prepare(sql).run(...args).changes),
    batch(steps) {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const [sql, args] of steps) db.prepare(sql).run(...args);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  });
}
