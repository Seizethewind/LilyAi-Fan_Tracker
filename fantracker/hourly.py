"""Hourly fan gain history for one club. Pure functions: no database, no Discord.

The rules (details in docs/HOURLY.md):

* The store keeps every member's fan total at each flat UTC hour (taken by the first sync
  of that hour). A line here is the club's gain between two consecutive stored hours, and
  "since reset" is the running total of the lines, so nothing is ever counted twice.
* Only members on the roster now are counted, so someone who left never appears, even for
  hours before they left.
* Only members who were already there at the first stored hour of the day are counted. That is
  the same join-day rule as the daily gain, so the total matches `/leaderboard daily`.
* Hours the bot missed are not invented: the next stored hour carries the whole gap and is
  marked like "(3h)".
* The hour still in progress is one extra line, worked out from the latest sync. It is not stored.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime

from fantracker.formatting import format_int, pad
from fantracker.storage.store import compute_gain

DAYS = ("today", "yesterday")


@dataclass(frozen=True)
class HourLine:
    time: datetime  # the flat UTC hour the line is stored at (end of the hour it covers); live: last sync
    hours: int  # hours it covers: 1 normally, more after missed hours, 0 for the live line
    gain: int  # the club's gain in this line
    since_reset: int  # running total after this line
    live: bool = False  # the hour still in progress (not stored)


@dataclass(frozen=True)
class HourlyHistory:
    day_start: datetime  # the reset this history counts from (15:00 UTC)
    day_end: datetime  # the next reset
    lines: tuple[HourLine, ...]
    first_mark: datetime | None  # earliest stored hour found; None when nothing is stored yet
    counted: bool = True  # False when one member was asked for but joined after the first stored hour

    @property
    def total(self) -> int:
        return self.lines[-1].since_reset if self.lines else 0

    @property
    def starts_late(self) -> bool:
        """True when hourly tracking began after the reset, so the total covers only part of the day."""
        return self.first_mark is not None and self.first_mark > self.day_start


def build_history(
    rows: Iterable[tuple[str, datetime, int]],
    current: Mapping[str, int] | None,
    day_start: datetime,
    day_end: datetime,
    live_time: datetime,
    only: str | None = None,
) -> HourlyHistory:
    """rows: (trainer_id, hour, fans) of current members. current: their latest totals, or None
    for a finished day (no live line). only: a trainer ID to show one member instead of the club;
    the same rules apply, and `counted` is False if they were not there at the first stored hour."""
    by_member: dict[str, dict[datetime, int]] = {}
    for trainer_id, mark, fans in rows:
        by_member.setdefault(trainer_id, {})[mark] = fans
    marks = sorted({mark for per_member in by_member.values() for mark in per_member})
    if not marks:
        return HourlyHistory(day_start, day_end, (), None)

    first = marks[0]
    # The members counted: those stored at the first hour. Value = their latest known total.
    previous = {trainer_id: per[first] for trainer_id, per in by_member.items() if first in per}
    if only is not None:
        if only not in previous:
            return HourlyHistory(day_start, day_end, (), first, counted=False)
        previous = {only: previous[only]}
    lines: list[HourLine] = []
    running = 0
    last_mark = first
    for mark in marks[1:]:
        gain = 0
        for trainer_id in list(previous):
            fans = by_member[trainer_id].get(mark)
            if fans is None:
                continue
            gain += compute_gain(fans, previous[trainer_id])
            previous[trainer_id] = fans
        running += gain
        hours = max(1, round((mark - last_mark).total_seconds() / 3600))
        lines.append(HourLine(mark, hours, gain, running))
        last_mark = mark

    if current is not None:
        gain = sum(compute_gain(current[t], before) for t, before in previous.items() if t in current)
        running += gain
        lines.append(HourLine(live_time, 0, gain, running, live=True))
    return HourlyHistory(day_start, day_end, tuple(lines), first)


def _label(line: HourLine) -> str:
    if line.live:
        return f"{line.time:%H:%M}*"
    text = f"{line.time:%H:%M}"
    return f"{text} ({line.hours}h)" if line.hours > 1 else text


def hourly_table(history: HourlyHistory) -> str:
    if not history.lines:
        return "No hourly data yet. It is saved at every full UTC hour, starting from the first update after one."
    labels = [_label(line) for line in history.lines]
    gains = [f"+{format_int(line.gain)}" for line in history.lines]
    totals = [f"+{format_int(line.since_reset)}" for line in history.lines]
    total_text = f"+{format_int(history.total)}"
    label_w = max(len("UTC"), len("Total"), *(len(x) for x in labels))
    gain_w = max(len("This hour"), *(len(x) for x in gains))
    total_w = max(len("Since reset"), len(total_text), *(len(x) for x in totals))
    rows = [f"{pad('UTC', label_w)}  {'This hour':>{gain_w}}  {'Since reset':>{total_w}}"]
    for label, gain, total in zip(labels, gains, totals, strict=True):
        rows.append(f"{pad(label, label_w)}  {gain:>{gain_w}}  {total:>{total_w}}")
    rows.append(f"{pad('Total', label_w)}  {'':>{gain_w}}  {total_text:>{total_w}}")
    return "```\n" + "\n".join(rows) + "\n```"
