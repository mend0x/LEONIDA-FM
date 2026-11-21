import { migration } from './migrations/001.mjs';

export function seedRows(catalog, programs, now = Date.now()) {
  const refs = catalog.references ?? [];
  return catalog.stations.map((entry, position) => {
    const { tracks = [], ...station } = entry;
    const ids = new Set([
      ...(station.evidence ?? []),
      ...tracks.flatMap((track) => track.evidence ?? []),
    ]);
    return {
      slug: station.slug,
      station,
      tracks,
      sources: null,
      programs: programs[station.slug] ?? [],
      evidence: refs.filter((ref) => ids.has(ref.id)),
      position,
      enabled: station.enabled !== false,
      revision: 1,
      updatedAt: now,
    };
  });
}

const serialize = ({ station, tracks, sources, programs, evidence }) =>
  JSON.stringify({ station, tracks, sources, programs, evidence });
const unpack = (row) =>
  row
    ? {
        ...JSON.parse(row.body),
        slug: row.slug,
        position: row.position,
        enabled: Boolean(row.enabled),
        revision: row.revision,
        updatedAt: row.updated_at,
      }
    : null;

export function createReadOnlyStore(rows) {
  const map = new Map(rows.map((row) => [row.slug, row]));
  return {
    available: false,
    init: async () => {},
    list: async () => rows,
    get: async (slug) => map.get(slug) ?? null,
    health: async () => true,
  };
}

export function createSqlStore(driver, migrate = true) {
  const allColumns = 'slug,position,enabled,revision,updated_at,body';
  return {
    available: true,
    async init(rows, version) {
      if (migrate) await driver.batch(migration.map((sql) => [sql, []]));
      const previous = await driver.first("SELECT value FROM catalog_meta WHERE key='seed'", []);
      if (previous?.value === version) return;
      const sql = `INSERT INTO station_catalog(slug,position,enabled,revision,seed_version,updated_at,body)
        VALUES(?,?,?,1,?,?,?) ON CONFLICT(slug) DO UPDATE SET body=excluded.body,position=excluded.position,
        enabled=excluded.enabled,seed_version=excluded.seed_version,updated_at=excluded.updated_at
        WHERE station_catalog.revision=1 AND station_catalog.seed_version IS NOT NULL AND station_catalog.seed_version<>excluded.seed_version`;
      const steps = rows.map((row) => [
        sql,
        [row.slug, row.position, Number(row.enabled), version, row.updatedAt, serialize(row)],
      ]);
      steps.push([
        "INSERT INTO catalog_meta(key,value) VALUES('seed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [version],
      ]);
      await driver.batch(steps);
    },
    async health() {
      return Boolean(await driver.first('SELECT 1 AS ready', []));
    },
    async list() {
      return (
        await driver.all(
          'SELECT ' + allColumns + ' FROM station_catalog ORDER BY position,slug',
          [],
        )
      ).map(unpack);
    },
    async get(slug) {
      return unpack(
        await driver.first('SELECT ' + allColumns + ' FROM station_catalog WHERE slug=?', [slug]),
      );
    },
    async save(row, expected) {
      let change;
      const args = [row.position, Number(row.enabled), row.updatedAt, serialize(row), row.slug];
      if (expected === 0) {
        change = await driver.run(
          'INSERT INTO station_catalog(position,enabled,updated_at,body,slug,revision) VALUES(?,?,?,?,?,1) ON CONFLICT(slug) DO NOTHING',
          args,
        );
      } else {
        change = await driver.run(
          'UPDATE station_catalog SET position=?,enabled=?,updated_at=?,body=?,revision=revision+1 WHERE slug=? AND revision=?',
          [...args, expected],
        );
      }
      return change === 1;
    },
    async addEvent(type, severity, slug, at, detail) {
      await driver.batch([
        [
          'INSERT INTO audit_events(type,severity,slug,at,detail) VALUES(?,?,?,?,?)',
          [type, severity, slug, at, detail],
        ],
        [
          'DELETE FROM audit_events WHERE id < (SELECT IFNULL(MAX(id),0)-2000 FROM audit_events)',
          [],
        ],
      ]);
    },
    events: (limit = 30) =>
      driver.all(
        'SELECT id,type,severity,slug,at,detail FROM audit_events ORDER BY id DESC LIMIT ?',
        [limit],
      ),
    async putSession(digest, expires, now) {
      await driver.batch([
        ['DELETE FROM admin_sessions WHERE expires<=?', [now]],
        ['INSERT INTO admin_sessions(digest,expires) VALUES(?,?)', [digest, expires]],
      ]);
    },
    async activeSession(digest, now) {
      return Boolean(
        await driver.first('SELECT 1 AS active FROM admin_sessions WHERE digest=? AND expires>?', [
          digest,
          now,
        ]),
      );
    },
    async removeSession(digest) {
      await driver.run('DELETE FROM admin_sessions WHERE digest=?', [digest]);
    },
    close: () => driver.close?.(),
  };
}

export function createD1Store(db) {
  const statement = (sql, values) =>
    values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
  return createSqlStore(
    {
      first: (sql, values) => statement(sql, values).first(),
      all: async (sql, values) => (await statement(sql, values).all()).results,
      run: async (sql, values) => (await statement(sql, values).run()).meta.changes,
      batch: (steps) => db.batch(steps.map(([sql, values]) => statement(sql, values))),
    },
    false,
  );
}
