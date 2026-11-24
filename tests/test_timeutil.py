"""Reset boundaries. Every reset is at 15:00 UTC (00:00 JST); a week never spans two months.

Calendar used: 2026-11-01 is a Sunday, 2026-11-02 a Monday, 2026-11-30 a Monday, 2026-12-01 a Tuesday,
2026-03-31 a Tuesday, 2026-04-01 a Wednesday.
"""

from datetime import date, datetime, timedelta, timezone

import pytest

from fantracker.timeutil import next_reset, period_start_day
from tests.conftest import utc


@pytest.mark.parametrize(
    ("now", "daily", "weekly", "monthly"),
    [
        ("2026-11-04 12:00", date(2026, 11, 4), date(2026, 11, 2), date(2026, 11, 1)),  # Wednesday
        ("2026-11-04 14:59", date(2026, 11, 4), date(2026, 11, 2), date(2026, 11, 1)),  # last minute of the day
        ("2026-11-04 15:00", date(2026, 11, 5), date(2026, 11, 2), date(2026, 11, 1)),  # first minute of the next
        ("2026-11-08 14:59", date(2026, 11, 8), date(2026, 11, 2), date(2026, 11, 1)),  # Sunday, last minute
        ("2026-11-08 15:00", date(2026, 11, 9), date(2026, 11, 9), date(2026, 11, 1)),  # Monday, first minute
        ("2026-10-31 15:00", date(2026, 11, 1), date(2026, 11, 1), date(2026, 11, 1)),  # Sunday the 1st: week cut
        ("2026-11-30 14:59", date(2026, 11, 30), date(2026, 11, 30), date(2026, 11, 1)),  # Monday, last of November
        ("2026-11-30 15:00", date(2026, 12, 1), date(2026, 12, 1), date(2026, 12, 1)),  # Monday's week stopped
        ("2026-03-31 14:59", date(2026, 3, 31), date(2026, 3, 30), date(2026, 3, 1)),  # month ends on a Tuesday
        ("2026-03-31 15:00", date(2026, 4, 1), date(2026, 4, 1), date(2026, 4, 1)),  # new week starts Wednesday
    ],
)
def test_period_starts(now, daily, weekly, monthly):
    moment = utc(now)
    assert period_start_day("daily", moment) == daily
    assert period_start_day("weekly", moment) == weekly
    assert period_start_day("monthly", moment) == monthly


@pytest.mark.parametrize(
    ("now", "period", "expected"),
    [
        ("2026-11-04 12:00", "daily", "2026-11-04 15:00"),
        ("2026-11-04 15:00", "daily", "2026-11-05 15:00"),  # exactly at the reset: the next one
        ("2026-12-31 14:59", "daily", "2026-12-31 15:00"),
        ("2026-11-04 12:00", "weekly", "2026-11-08 15:00"),  # Monday 00:00 JST is Sunday 15:00 UTC
        ("2026-11-08 15:00", "weekly", "2026-11-15 15:00"),
        ("2026-10-31 15:00", "weekly", "2026-11-01 15:00"),  # a one-day week: Sunday the 1st
        ("2026-03-31 14:59", "weekly", "2026-03-31 15:00"),  # cut short by a month that ends on a Tuesday
        ("2026-03-31 15:00", "weekly", "2026-04-05 15:00"),  # the next week runs Wednesday to Sunday
        ("2026-11-04 12:00", "monthly", "2026-11-30 15:00"),
        ("2026-12-31 14:59", "monthly", "2026-12-31 15:00"),
        ("2026-12-31 15:00", "monthly", "2027-01-31 15:00"),
    ],
)
def test_next_reset(now, period, expected):
    assert next_reset(period, utc(now)) == utc(expected)


def test_non_utc_input_is_converted():
    manila = timezone(timedelta(hours=8))
    # 23:30 in Manila is 15:30 UTC, so the game day has already changed. 22:30 has not.
    assert period_start_day("daily", datetime(2026, 11, 9, 23, 30, tzinfo=manila)) == date(2026, 11, 10)
    assert period_start_day("daily", datetime(2026, 11, 9, 22, 30, tzinfo=manila)) == date(2026, 11, 9)


def test_naive_datetime_is_rejected():
    with pytest.raises(ValueError):
        period_start_day("daily", datetime(2026, 11, 4, 12, 0))


def test_unknown_period_is_rejected():
    with pytest.raises(ValueError):
        period_start_day("hourly", utc("2026-11-04 12:00"))
    with pytest.raises(ValueError):
        next_reset("hourly", utc("2026-11-04 12:00"))
