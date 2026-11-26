"""The source's own daily totals as day snapshots: the month starts where uma.moe's monthly gain starts.

MOCKED data, but the layout of ``daily_fans`` (index i = total at the end of day i+1, last entry = live total,
negative = days in a previous club) was checked against a real uma.moe club export: monthly_gain =
current total - daily_fans[0] held for all 30 active members.
"""

from __future__ import annotations

import pytest

from fantracker.models import ClubSnapshot, SourceMember
from fantracker.sources.umamoe import month_history
from tests.conftest import CLUB1


def with_history(world, trainer, name, fans, history, club=CLUB1):
    snap = ClubSnapshot(club.club_id, [SourceMember(trainer, name, fans, history=tuple(history))])
    world.store.apply_sync(snap, world.now)


def test_month_history_is_the_start_of_each_following_day_without_the_live_entry():
    row = {"year": 2026, "month": 11, "daily_fans": [-100, 0, 300, 400, 0, 0]}  # negative = earlier club
    assert month_history(row) == (("2026-11-02", 100), ("2026-11-04", 300))  # 400 is the live total


@pytest.mark.parametrize("row", [{}, {"year": 2026, "month": 13, "daily_fans": [1, 2]}, {"year": 2026, "month": 11}])
def test_month_history_is_empty_without_usable_data(row):
    assert month_history(row) == ()


def test_history_starts_the_month_where_the_source_does(world):
    world.at("2026-11-26 01:00")  # 10:00 JST on the 26th
    # totals at the start of Nov 2, Nov 25 and Nov 26; the live total is 1_000
    with_history(world, "7", "Gath", 1_000, [("2026-11-02", 100), ("2026-11-25", 700), ("2026-11-26", 900)])
    assert world.gain("7", "monthly") == (900, True)  # 1_000 - 100
    assert world.gain("7", "daily") == (100, True)  # 1_000 - 900
    assert world.gain("7", "weekly") == (300, True)  # since Mon Nov 23: the first total from then is the 25th


def test_history_never_overwrites_a_snapshot_we_took(world):
    world.at("2026-11-26 00:05").roster({"7": ("Gath", 900)}).sync()
    with_history(world, "7", "Gath", 1_000, [("2026-11-26", 5)])
    assert world.gain("7", "daily") == (100, True)


def test_history_ignores_days_that_have_not_happened(world):
    world.at("2026-11-26 01:00")
    with_history(world, "7", "Gath", 1_000, [("2026-11-27", 5)])
    assert world.gain("7", "monthly") == (0, True)  # only today's own first snapshot
