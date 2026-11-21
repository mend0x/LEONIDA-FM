// Each editorial station, its ordered tracks, sources, evidence and programs form
// one revisioned aggregate. SQLite JSON projections keep the rows queryable.
export const migration = [
  `CREATE TABLE IF NOT EXISTS station_catalog (
     slug TEXT PRIMARY KEY, position INTEGER NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
     revision INTEGER NOT NULL CHECK(revision >= 1), seed_version TEXT, updated_at INTEGER NOT NULL,
     body TEXT NOT NULL CHECK(json_valid(body))
   )`,
  'CREATE INDEX IF NOT EXISTS station_dial_order ON station_catalog(enabled, position, slug)',
  `CREATE TABLE IF NOT EXISTS audit_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, severity TEXT NOT NULL,
     slug TEXT, at INTEGER NOT NULL, detail TEXT NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS event_time ON audit_events(at DESC)',
  'CREATE TABLE IF NOT EXISTS admin_sessions (digest TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS session_expiration ON admin_sessions(expires)',
  'CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  `CREATE VIEW IF NOT EXISTS station_tracks AS SELECT s.slug, t.key AS position,
     json_extract(t.value,'$.title') AS title,json_extract(t.value,'$.artist') AS artist,t.value AS record
     FROM station_catalog AS s,json_each(s.body,'$.tracks') AS t`,
  `CREATE VIEW IF NOT EXISTS programs AS SELECT s.slug,p.key AS position,p.value AS record
     FROM station_catalog AS s,json_each(s.body,'$.programs') AS p`,
  `CREATE VIEW IF NOT EXISTS audio_sources AS SELECT s.slug,a.key AS position,a.value AS record
     FROM station_catalog AS s,json_each(s.body,'$.sources') AS a`,
  `CREATE VIEW IF NOT EXISTS source_evidence AS SELECT s.slug,r.key AS position,r.value AS record
     FROM station_catalog AS s,json_each(s.body,'$.evidence') AS r`,
  `CREATE TRIGGER IF NOT EXISTS audit_new_station AFTER INSERT ON station_catalog
     WHEN NEW.seed_version IS NULL BEGIN
       INSERT INTO audit_events(type,severity,slug,at,detail)
       VALUES('station.created','info',NEW.slug,NEW.updated_at,'Station created');
     END`,
  `CREATE TRIGGER IF NOT EXISTS audit_edited_station AFTER UPDATE ON station_catalog
     WHEN NEW.revision > OLD.revision BEGIN
       INSERT INTO audit_events(type,severity,slug,at,detail)
       VALUES('station.updated','info',NEW.slug,NEW.updated_at,'Station revision ' || NEW.revision);
     END`,
];
