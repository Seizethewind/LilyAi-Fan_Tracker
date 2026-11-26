export const TURSO_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS clubs (
    club_id TEXT PRIMARY KEY,
    name TEXT,
    last_synced_at TEXT,
    last_error TEXT,
    last_error_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    club_id TEXT NOT NULL,
    trainer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    fans INTEGER NOT NULL,
    active INTEGER NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    left_at TEXT,
    PRIMARY KEY (club_id, trainer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS day_snapshots (
    club_id TEXT NOT NULL,
    trainer_id TEXT NOT NULL,
    day TEXT NOT NULL,
    fans INTEGER NOT NULL,
    PRIMARY KEY (club_id, trainer_id, day)
  )`,
  `CREATE TABLE IF NOT EXISTS hour_snapshots (
    club_id TEXT NOT NULL,
    trainer_id TEXT NOT NULL,
    hour_iso TEXT NOT NULL,
    fans INTEGER NOT NULL,
    PRIMARY KEY (club_id, trainer_id, hour_iso)
  )`,
  `CREATE TABLE IF NOT EXISTS links (
    discord_id TEXT PRIMARY KEY,
    trainer_id TEXT NOT NULL
  )`,
];
