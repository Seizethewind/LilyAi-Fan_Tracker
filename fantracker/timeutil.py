"""Reset boundaries. The game's day changes at 00:00 JST, which is 15:00 UTC, and so does uma.moe.

* daily: every game day, at 15:00 UTC.
* weekly: every Monday 00:00 JST (Sunday 15:00 UTC). A week that is cut by a month end stops
  there: the new month starts a new, shorter week. So a week never spans two months.
* monthly: the 1st at 00:00 JST (15:00 UTC on the last day of the previous month).

Day keys (the `day` stored with a snapshot) are game-day dates, i.e. the JST calendar date.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone

PERIODS = ("daily", "weekly", "monthly")

GAME_TZ = timezone(timedelta(hours=9))  # JST has no daylight saving, so a fixed offset is exact


def utc_now() -> datetime:
    return datetime.now(UTC)


def _as_utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        raise ValueError("naive datetimes are not accepted; pass an aware datetime")
    return moment.astimezone(UTC)


def game_day(now: datetime) -> date:
    """The game-day date (JST calendar date) that contains `now`."""
    return _as_utc(now).astimezone(GAME_TZ).date()


def _first_of_next_month(day: date) -> date:
    return (day.replace(day=28) + timedelta(days=4)).replace(day=1)


def period_start_day(period: str, now: datetime) -> date:
    """First game day of the period that contains `now`."""
    today = game_day(now)
    if period == "daily":
        return today
    month_start = today.replace(day=1)
    if period == "weekly":
        return max(today - timedelta(days=today.weekday()), month_start)  # Monday is 0
    if period == "monthly":
        return month_start
    raise ValueError(f"unknown period: {period!r}")


def next_reset(period: str, now: datetime) -> datetime:
    """The moment the current period ends and the next one begins."""
    today = game_day(now)
    if period == "daily":
        following = today + timedelta(days=1)
    elif period == "weekly":
        next_monday = today - timedelta(days=today.weekday()) + timedelta(days=7)
        following = min(next_monday, _first_of_next_month(today))
    elif period == "monthly":
        following = _first_of_next_month(today)
    else:
        raise ValueError(f"unknown period: {period!r}")
    return datetime(following.year, following.month, following.day, tzinfo=GAME_TZ).astimezone(UTC)


def iso(moment: datetime) -> str:
    return _as_utc(moment).isoformat(timespec="seconds")


def parse_iso(text: str | None) -> datetime | None:
    if not text:
        return None
    return datetime.fromisoformat(text)
