"""Application logic shared by the Discord commands and the HTTP API.

Synchronous on purpose: callers in async code wrap calls in
`asyncio.to_thread`. Nothing here imports Discord or the web framework.
"""

from __future__ import annotations

import logging
import re
import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from fantracker.config import ClubConfig
from fantracker.hourly import DAYS, HourlyHistory, build_history
from fantracker.models import ClubInfo, StandingRow, SyncOutcome, SyncResult
from fantracker.sources.base import FanSource, SourceError
from fantracker.storage import DatabaseError, Store
from fantracker.timeutil import PERIODS, next_reset, utc_now

logger = logging.getLogger(__name__)

MAX_TOP = 30  # a club holds 30 members

_TRAINER_ID = re.compile(r"[A-Za-z0-9_]{1,32}")


def normalize_trainer_id(raw: str) -> str:
    """Drop the spaces and dashes people type when copying an ID."""
    return re.sub(r"[\s\-]", "", raw)


@dataclass(frozen=True)
class LinkResult:
    status: str  # linked | relinked | invalid | not_found | not_synced
    trainer_id: str | None = None
    trainer_name: str | None = None
    club_label: str | None = None


@dataclass(frozen=True)
class Leaderboard:
    club: ClubConfig
    period: str
    top: int
    rows: list[StandingRow]
    info: ClubInfo
    resets_at: datetime


@dataclass(frozen=True)
class Standing:
    club: ClubConfig
    period: str
    row: StandingRow
    roster_size: int
    info: ClubInfo
    resets_at: datetime


@dataclass(frozen=True)
class HourlyView:
    club: ClubConfig
    day: str  # today | yesterday
    history: HourlyHistory
    info: ClubInfo
    resets_at: datetime
    trainer_id: str | None = None  # set when the history is for one member instead of the club
    trainer_name: str | None = None


class TrackerService:
    def __init__(
        self,
        store: Store,
        source: FanSource,
        clubs: Sequence[ClubConfig],
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.store = store
        self.source = source
        self.clubs = tuple(clubs)
        self._clock = clock
        self._sync_lock = threading.Lock()
        self._by_key = {c.key: c for c in self.clubs}
        self._by_id = {c.club_id: c for c in self.clubs}

    def club(self, key_or_id: str) -> ClubConfig | None:
        return self._by_key.get(key_or_id) or self._by_id.get(key_or_id)

    # ---- syncing -------------------------------------------------------

    def sync_club(self, club: ClubConfig) -> SyncResult:
        with self._sync_lock:
            snapshot = self.source.fetch_club(club.club_id)
            if snapshot.club_id != club.club_id:
                raise SourceError("the source returned a different club than requested")
            if not snapshot.members:
                raise SourceError("the source returned an empty roster; keeping the previous data")
            return self.store.apply_sync(snapshot, self._clock())

    def sync_all(self) -> list[SyncOutcome]:
        """Sync every club. One club failing never stops the others."""
        outcomes: list[SyncOutcome] = []
        for club in self.clubs:
            try:
                outcomes.append(SyncOutcome(club.key, True, result=self.sync_club(club)))
            except (SourceError, DatabaseError) as exc:
                logger.warning("Sync of %s failed: %s", club.key, exc)
                outcomes.append(self._failed(club, str(exc)))
            except Exception as exc:  # noqa: BLE001 - logged with traceback, reported without detail
                logger.exception("Unexpected error while syncing %s", club.key)
                outcomes.append(self._failed(club, f"unexpected error ({type(exc).__name__})"))
        return outcomes

    def _failed(self, club: ClubConfig, message: str) -> SyncOutcome:
        try:
            self.store.record_sync_error(club.club_id, message, self._clock())
        except DatabaseError:
            logger.exception("Could not record the sync error for %s", club.key)
        return SyncOutcome(club.key, False, error=message)

    # ---- queries -------------------------------------------------------

    def club_infos(self) -> list[tuple[ClubConfig, ClubInfo]]:
        return [(club, self.store.club_info(club.club_id)) for club in self.clubs]

    def leaderboard(self, club: ClubConfig, period: str, top: int) -> Leaderboard:
        _check_period(period)
        top = max(1, min(int(top), MAX_TOP))
        now = self._clock()
        rows = self.store.standings(club.club_id, period, now)[:top]
        return Leaderboard(club, period, top, rows, self.store.club_info(club.club_id), next_reset(period, now))

    def standing_for_trainer(self, trainer_id: str, period: str) -> Standing | None:
        _check_period(period)
        found = self.store.find_active_member(trainer_id)
        club = self._by_id.get(found[0]) if found else None
        if club is None:
            return None
        now = self._clock()
        rows = self.store.standings(club.club_id, period, now)
        row = next((r for r in rows if r.trainer_id == trainer_id), None)
        if row is None:
            return None
        return Standing(club, period, row, len(rows), self.store.club_info(club.club_id), next_reset(period, now))

    def fan_gain_history(self, club: ClubConfig, day: str = "today") -> HourlyView:
        """The club's fan gain hour by hour: today since the 00:00 UTC reset, or all of yesterday."""
        return self._hourly_view(club, day)

    def trainer_fan_gain_history(self, trainer_id: str, day: str = "today") -> HourlyView | None:
        """The same hourly history for one member on a roster now; None if they are not on one."""
        found = self.store.find_active_member(trainer_id)
        club = self._by_id.get(found[0]) if found else None
        if found is None or club is None:
            return None
        return self._hourly_view(club, day, trainer_id, found[1])

    def _hourly_view(
        self, club: ClubConfig, day: str, trainer_id: str | None = None, trainer_name: str | None = None
    ) -> HourlyView:
        if day not in DAYS:
            raise ValueError(f"day must be one of {', '.join(DAYS)}")
        now = self._clock()
        resets_at = next_reset("daily", now)
        today_start = resets_at - timedelta(days=1)
        info = self.store.club_info(club.club_id)
        if day == "yesterday":
            start, end = today_start - timedelta(days=1), today_start
            current, live_time = None, end
        else:
            start, end = today_start, resets_at
            current, live_time = self.store.current_fans(club.club_id), info.last_synced_at or now
        rows = self.store.hour_rows(club.club_id, start, end)
        history = build_history(rows, current, start, end, live_time, only=trainer_id)
        return HourlyView(club, day, history, info, resets_at, trainer_id, trainer_name)

    # ---- discord links -------------------------------------------------

    def link(self, discord_id: str, raw_trainer_id: str) -> LinkResult:
        trainer_id = normalize_trainer_id(raw_trainer_id)
        if not _TRAINER_ID.fullmatch(trainer_id):
            return LinkResult("invalid")
        found = self.store.find_active_member(trainer_id)
        if found is None:
            synced = any(info.last_synced_at for _, info in self.club_infos())
            return LinkResult("not_found" if synced else "not_synced")
        club_id, name, _fans = found
        previous = self.store.set_link(discord_id, trainer_id, self._clock())
        club = self._by_id.get(club_id)
        status = "relinked" if previous and previous != trainer_id else "linked"
        return LinkResult(status, trainer_id, name, club.label if club else None)

    def unlink(self, discord_id: str) -> bool:
        return self.store.remove_link(discord_id)

    def linked_trainer(self, discord_id: str) -> str | None:
        return self.store.get_link(discord_id)


def _check_period(period: str) -> None:
    if period not in PERIODS:
        raise ValueError(f"period must be one of {', '.join(PERIODS)}")
