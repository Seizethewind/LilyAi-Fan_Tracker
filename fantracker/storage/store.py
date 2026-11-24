"""All SQL lives here. Works on SQLite and on Turso (libSQL).

Gain model
----------
`day_snapshots` holds each member's fan total as of the FIRST successful sync
of each game day (it starts at 15:00 UTC), for every member on the roster at
that moment. The baseline for a period is the member's earliest snapshot on or
after the period's first day. gain = current total - baseline.

That one rule produces the behaviour the project asked for:

* Join day is 0: someone who appears after the day's first sync has no
  snapshot for that day, so today's gain (and, for a new joiner, the week's
  and month's gain) is 0. From the next game day they have a snapshot and
  gains compute normally.
* Leaving removes the member from the roster (active = 0). Snapshots stay.
* Moving to the other club keeps the baseline: snapshots are matched by trainer, whichever club
  stored them, so someone promoted from Club 2 to Club 1 keeps the gain they already earned.
* Rejoining in the same month finds their older snapshots, so the original
  baseline is restored. Rejoining in a later month finds none for the new
  month, so they start over like a new player.

Hourly history
--------------
`hour_snapshots` is the same idea once per flat UTC hour: each member's fan
total as of the first successful sync in that hour, kept for a few days. The
hourly fan gain history (fantracker/hourly.py) is computed from it.

Writes in `apply_sync` are ordered so that a failure part-way (Turso
pipelines are not atomic) is repaired by the next sync.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fantracker.models import ClubInfo, ClubSnapshot, StandingRow, SyncResult
from fantracker.storage.db import Database
from fantracker.timeutil import iso, parse_iso, period_start_day

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS clubs (
        club_id TEXT PRIMARY KEY,
        name TEXT,
        last_synced_at TEXT,
        last_error TEXT,
        last_error_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS members (
        club_id TEXT NOT NULL,
        trainer_id TEXT NOT NULL,
        name TEXT NOT NULL,
        fans INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        left_at TEXT,
        PRIMARY KEY (club_id, trainer_id)
    )""",
    """CREATE TABLE IF NOT EXISTS day_snapshots (
        club_id TEXT NOT NULL,
        trainer_id TEXT NOT NULL,
        day TEXT NOT NULL,
        fans INTEGER NOT NULL,
        PRIMARY KEY (club_id, trainer_id, day)
    )""",
    """CREATE TABLE IF NOT EXISTS hour_snapshots (
        club_id TEXT NOT NULL,
        trainer_id TEXT NOT NULL,
        hour TEXT NOT NULL,
        fans INTEGER NOT NULL,
        PRIMARY KEY (club_id, trainer_id, hour)
    )""",
    """CREATE TABLE IF NOT EXISTS links (
        discord_id TEXT PRIMARY KEY,
        trainer_id TEXT NOT NULL,
        linked_at TEXT NOT NULL
    )""",
)

STANDINGS_SQL = """
SELECT m.trainer_id, m.name, m.fans,
       (SELECT s.fans FROM day_snapshots s
         WHERE s.trainer_id = m.trainer_id AND s.day >= ?
         ORDER BY s.day ASC, (s.club_id = ?) DESC LIMIT 1) AS baseline
FROM members m
WHERE m.club_id = ? AND m.active = 1
"""

# Only members on the roster now: someone who left never appears in the hourly history. A member who
# moved here from the other club brings the hours that club stored for them.
HOUR_ROWS_SQL = """
SELECT h.trainer_id, h.hour, h.fans
FROM hour_snapshots h
JOIN members m ON m.trainer_id = h.trainer_id AND m.club_id = ? AND m.active = 1
WHERE h.hour >= ? AND h.hour <= ?
ORDER BY h.hour ASC
"""

HOUR_HISTORY_DAYS = 8  # hourly snapshots older than this are deleted


def hour_mark(moment: datetime) -> datetime:
    """The flat UTC hour that `moment` falls in."""
    return moment.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def compute_gain(current: int, baseline: int | None) -> int:
    """Gain over a period.

    No baseline (join day): 0.
    Total below baseline: the source's tally was reset (for example at month
    end), so everything now counted belongs to the new tally.
    """
    if baseline is None:
        return 0
    if current < baseline:
        return current
    return current - baseline


class Store:
    def __init__(self, db: Database) -> None:
        self.db = db

    def init_schema(self) -> None:
        self.db.execute_many([(sql, ()) for sql in SCHEMA])

    # ---- syncing -------------------------------------------------------

    def apply_sync(self, snapshot: ClubSnapshot, now: datetime) -> SyncResult:
        if not snapshot.members:
            raise ValueError("refusing to apply an empty roster")

        members = {m.trainer_id: m for m in snapshot.members}  # de-duplicate by trainer id
        today = period_start_day("daily", now).isoformat()
        mark = hour_mark(now)
        hour = iso(mark)
        stamp = iso(now)
        club_id = snapshot.club_id

        known_rows, today_rows, hour_found = self.db.execute_many(
            [
                ("SELECT trainer_id, active FROM members WHERE club_id = ?", (club_id,)),
                ("SELECT 1 FROM day_snapshots WHERE club_id = ? AND day = ? LIMIT 1", (club_id, today)),
                ("SELECT 1 FROM hour_snapshots WHERE club_id = ? AND hour = ? LIMIT 1", (club_id, hour)),
            ]
        )
        known = {trainer_id: bool(active) for trainer_id, active in known_rows}
        have_today_snapshot = bool(today_rows)
        have_hour_snapshot = bool(hour_found)

        present = list(members)
        joined = [t for t in present if not known.get(t, False)]
        left = [t for t, active in known.items() if active and t not in members]

        upsert_values: list = []
        for member in members.values():
            upsert_values += [club_id, member.trainer_id, member.name, member.fans, stamp, stamp]
        row_sql = "(?, ?, ?, ?, 1, ?, ?, NULL)"
        statements = [
            (
                "INSERT INTO members (club_id, trainer_id, name, fans, active, first_seen_at, last_seen_at, left_at) "
                f"VALUES {', '.join([row_sql] * len(members))} "
                "ON CONFLICT(club_id, trainer_id) DO UPDATE SET "
                "name = excluded.name, fans = excluded.fans, active = 1, "
                "last_seen_at = excluded.last_seen_at, left_at = NULL",
                upsert_values,
            ),
            (
                "UPDATE members SET active = 0, left_at = ? WHERE club_id = ? AND active = 1 "
                f"AND trainer_id NOT IN ({', '.join('?' * len(present))})",
                [stamp, club_id, *present],
            ),
        ]
        if not have_today_snapshot:
            snap_values: list = []
            for member in members.values():
                snap_values += [club_id, member.trainer_id, today, member.fans]
            statements.append(
                (
                    "INSERT OR IGNORE INTO day_snapshots (club_id, trainer_id, day, fans) "
                    f"VALUES {', '.join(['(?, ?, ?, ?)'] * len(members))}",
                    snap_values,
                )
            )
        if not have_hour_snapshot:
            hour_values: list = []
            for member in members.values():
                hour_values += [club_id, member.trainer_id, hour, member.fans]
            statements.append(
                (
                    "INSERT OR IGNORE INTO hour_snapshots (club_id, trainer_id, hour, fans) "
                    f"VALUES {', '.join(['(?, ?, ?, ?)'] * len(members))}",
                    hour_values,
                )
            )
            statements.append(
                (
                    "DELETE FROM hour_snapshots WHERE club_id = ? AND hour < ?",
                    [club_id, iso(mark - timedelta(days=HOUR_HISTORY_DAYS))],
                )
            )
        # Last, so `last_synced_at` only moves when everything above worked.
        statements.append(
            (
                "INSERT INTO clubs (club_id, name, last_synced_at, last_error, last_error_at) "
                "VALUES (?, ?, ?, NULL, NULL) "
                "ON CONFLICT(club_id) DO UPDATE SET name = COALESCE(excluded.name, clubs.name), "
                "last_synced_at = excluded.last_synced_at, last_error = NULL, last_error_at = NULL",
                [club_id, snapshot.club_name, stamp],
            )
        )
        self.db.execute_many(statements)
        return SyncResult(
            club_id=club_id,
            member_count=len(members),
            joined=joined,
            left=left,
            took_day_snapshot=not have_today_snapshot,
        )

    def record_sync_error(self, club_id: str, message: str, now: datetime) -> None:
        self.db.execute(
            "INSERT INTO clubs (club_id, last_error, last_error_at) VALUES (?, ?, ?) "
            "ON CONFLICT(club_id) DO UPDATE SET last_error = excluded.last_error, "
            "last_error_at = excluded.last_error_at",
            (club_id, message[:300], iso(now)),
        )

    # ---- reading -------------------------------------------------------

    def club_info(self, club_id: str) -> ClubInfo:
        rows = self.db.execute("SELECT name, last_synced_at, last_error FROM clubs WHERE club_id = ?", (club_id,))
        name, synced, error = rows[0] if rows else (None, None, None)
        count = self.db.execute(
            "SELECT COUNT(*) FROM members WHERE club_id = ? AND active = 1", (club_id,)
        )[0][0]
        return ClubInfo(club_id, name, int(count), parse_iso(synced), error)

    def standings(self, club_id: str, period: str, now: datetime) -> list[StandingRow]:
        start = period_start_day(period, now).isoformat()
        scored = []
        for trainer_id, name, fans, baseline in self.db.execute(STANDINGS_SQL, (start, club_id, club_id)):
            fans = int(fans)
            base = None if baseline is None else int(baseline)
            scored.append((compute_gain(fans, base), fans, name, trainer_id, base is not None))
        scored.sort(key=lambda r: (-r[0], -r[1], r[2].lower(), r[3]))
        return [
            StandingRow(rank, trainer_id, name, fans, gain, has_baseline)
            for rank, (gain, fans, name, trainer_id, has_baseline) in enumerate(scored, start=1)
        ]

    def hour_rows(self, club_id: str, start: datetime, end: datetime) -> list[tuple[str, datetime, int]]:
        """(trainer_id, hour, fans) for current members, from `start` to `end`, both included."""
        rows = self.db.execute(HOUR_ROWS_SQL, (club_id, iso(start), iso(end)))
        return [(trainer_id, datetime.fromisoformat(hour), int(fans)) for trainer_id, hour, fans in rows]

    def current_fans(self, club_id: str) -> dict[str, int]:
        """Latest fan total of every member on the roster now."""
        rows = self.db.execute("SELECT trainer_id, fans FROM members WHERE club_id = ? AND active = 1", (club_id,))
        return {trainer_id: int(fans) for trainer_id, fans in rows}

    def find_active_member(self, trainer_id: str) -> tuple[str, str, int] | None:
        """(club_id, name, fans) of the roster entry for this trainer, if on a roster now."""
        rows = self.db.execute(
            "SELECT club_id, name, fans FROM members WHERE trainer_id = ? AND active = 1 "
            "ORDER BY last_seen_at DESC LIMIT 1",
            (trainer_id,),
        )
        if not rows:
            return None
        club_id, name, fans = rows[0]
        return club_id, name, int(fans)

    # ---- links ---------------------------------------------------------

    def set_link(self, discord_id: str, trainer_id: str, now: datetime) -> str | None:
        """Save the link; returns the trainer id it replaced, if any."""
        previous = self.get_link(discord_id)
        self.db.execute(
            "INSERT INTO links (discord_id, trainer_id, linked_at) VALUES (?, ?, ?) "
            "ON CONFLICT(discord_id) DO UPDATE SET trainer_id = excluded.trainer_id, "
            "linked_at = excluded.linked_at",
            (discord_id, trainer_id, iso(now)),
        )
        return previous

    def get_link(self, discord_id: str) -> str | None:
        rows = self.db.execute("SELECT trainer_id FROM links WHERE discord_id = ?", (discord_id,))
        return rows[0][0] if rows else None

    def remove_link(self, discord_id: str) -> bool:
        if self.get_link(discord_id) is None:
            return False
        self.db.execute("DELETE FROM links WHERE discord_id = ?", (discord_id,))
        return True
