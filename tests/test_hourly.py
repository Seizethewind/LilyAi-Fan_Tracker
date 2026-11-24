"""Hourly fan gain history: what is stored, how the lines add up, and what the command says.

MOCKED: a fake data source and an in-memory SQLite database. Passing tests prove the logic,
not that uma.moe, Discord or Turso behave the same in a real deployment.

Calendar used: 2026-11-04 is a Wednesday. Its game day starts at 15:00 UTC on 2026-11-03 (00:00 JST),
so the hourly lines carry UTC times from 16:00 on.
"""

from __future__ import annotations

from datetime import timedelta

from fantracker.commands import cmd_fan_gain_history
from fantracker.hourly import build_history, hourly_table
from fantracker.storage.store import hour_mark
from tests.conftest import CLUB1, utc


def history(world, club=CLUB1, day="today"):
    return world.service.fan_gain_history(club, day).history


def daily_total(world, club=CLUB1):
    return sum(row.gain for row in world.store.standings(club.club_id, "daily", world.now))


def summary(h):
    return [(line.time.strftime("%H:%M"), line.hours, line.gain, line.since_reset, line.live) for line in h.lines]


def two_members_for_a_morning(world):
    world.at("2026-11-03 15:05").roster({"A": ("Alice", 1000), "B": ("Bob", 2000)}).sync()
    world.at("2026-11-03 16:05").roster({"A": ("Alice", 1300), "B": ("Bob", 2200)}).sync()
    world.at("2026-11-03 17:05").roster({"A": ("Alice", 1700), "B": ("Bob", 2500)}).sync()
    world.at("2026-11-03 17:40").roster({"A": ("Alice", 1750), "B": ("Bob", 2550)}).sync()


def test_hour_mark_is_the_flat_utc_hour():
    assert hour_mark(utc("2026-11-04 02:40")) == utc("2026-11-04 02:00")


def test_lines_are_hourly_gains_and_the_total_is_not_counted_twice(world):
    two_members_for_a_morning(world)
    h = history(world)
    assert summary(h) == [
        ("16:00", 1, 500, 500, False),
        ("17:00", 1, 700, 1200, False),
        ("17:40", 0, 100, 1300, True),  # the hour still in progress
    ]
    assert not h.starts_late
    # Three ways to the same number: the last "since reset", the sum of the lines, the daily gain.
    assert h.total == 1300
    assert sum(line.gain for line in h.lines) == 1300
    assert daily_total(world) == 1300


def test_each_flat_hour_is_stored_once(world):
    world.at("2026-11-04 02:05").roster({"A": ("Alice", 100), "B": ("Bob", 200)}).sync()
    world.at("2026-11-04 02:35").roster({"A": ("Alice", 150), "B": ("Bob", 260)}).sync()
    rows = world.db.execute(
        "SELECT trainer_id, hour, fans FROM hour_snapshots WHERE club_id = ? ORDER BY trainer_id", (CLUB1.club_id,)
    )
    assert rows == [("A", "2026-11-04T02:00:00+00:00", 100), ("B", "2026-11-04T02:00:00+00:00", 200)]


def test_members_who_left_are_not_counted_at_all(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 1000), "C": ("Cara", 5000)}).sync()
    world.at("2026-11-04 01:05").roster({"A": ("Alice", 1100), "C": ("Cara", 5900)}).sync()
    world.at("2026-11-04 02:05").roster({"A": ("Alice", 1200)}).sync()  # Cara has left
    h = history(world)
    assert summary(h) == [("01:00", 1, 100, 100, False), ("02:00", 1, 100, 200, False), ("02:05", 0, 0, 200, True)]
    assert h.total == daily_total(world) == 200


def test_joiners_count_from_the_next_day_like_the_daily_gain(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 1000)}).sync()
    world.at("2026-11-04 01:05").roster({"A": ("Alice", 1100)}).sync()
    world.at("2026-11-04 02:05").roster({"A": ("Alice", 1200), "B": ("Bob", 5000)}).sync()  # Bob joins
    world.at("2026-11-04 03:05").roster({"A": ("Alice", 1250), "B": ("Bob", 5400)}).sync()
    h = history(world)
    assert [line.gain for line in h.lines] == [100, 100, 50, 0]  # Bob's 400 is not in it
    assert h.total == daily_total(world) == 250
    assert world.gain("B", "daily") == (0, False)


def test_missed_hours_are_not_invented(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 1000)}).sync()
    world.at("2026-11-04 01:05").roster({"A": ("Alice", 1100)}).sync()
    world.at("2026-11-04 04:05").roster({"A": ("Alice", 1500)}).sync()  # nothing synced at 02:xx or 03:xx
    h = history(world)
    assert summary(h) == [("01:00", 1, 100, 100, False), ("04:00", 3, 400, 500, False), ("04:05", 0, 0, 500, True)]
    assert "04:00 (3h)" in hourly_table(h)
    assert h.total == daily_total(world) == 500


def test_a_reset_tally_counts_the_new_total_never_a_negative_gain(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 5000)}).sync()
    world.at("2026-11-04 01:05").roster({"A": ("Alice", 300)}).sync()
    assert [line.gain for line in history(world).lines][0] == 300


def test_history_that_starts_mid_day_says_so(world):
    world.at("2026-11-04 06:17").roster({"A": ("Alice", 100)}).sync()  # first sync of the day
    world.at("2026-11-04 07:05").roster({"A": ("Alice", 160)}).sync()
    h = history(world)
    assert h.starts_late and h.first_mark == utc("2026-11-04 06:00")
    assert [line.gain for line in h.lines] == [60, 0]


def test_yesterday_is_a_full_day_with_the_last_hour_stored_at_the_reset(world):
    world.at("2026-11-03 15:05").roster({"A": ("Alice", 100)}).sync()  # first sync of Wed 4 Nov
    world.at("2026-11-04 03:05").roster({"A": ("Alice", 400)}).sync()
    world.at("2026-11-04 15:05").roster({"A": ("Alice", 460)}).sync()  # first sync of Thu 5 Nov
    world.at("2026-11-04 15:30")
    h = history(world, day="yesterday")
    assert summary(h) == [("03:00", 12, 300, 300, False), ("15:00", 12, 60, 360, False)]
    assert "15:00 (12h)" in hourly_table(h)  # the last line, stored when the reset happened
    assert not any(line.live for line in h.lines)


def test_old_hourly_rows_are_deleted_after_eight_days(world):
    world.at("2026-11-01 00:05").roster({"A": ("Alice", 100)}).sync()
    world.at("2026-11-12 00:05").roster({"A": ("Alice", 200)}).sync()
    rows = world.db.execute("SELECT hour FROM hour_snapshots WHERE club_id = ?", (CLUB1.club_id,))
    assert rows == [("2026-11-12T00:00:00+00:00",)]


def test_a_whole_day_of_hourly_syncs_adds_up_to_the_daily_gain(world):
    fans = {"A": 1000, "B": 2000, "C": 3000}
    opening = utc("2026-11-03 15:05")  # the first sync of game day Wed 4 Nov
    for hour in range(24):
        for minute in (0, 30):
            for who, step in (("A", 10), ("B", 25), ("C", 7)):
                fans[who] += step * (hour + 1)
            world.now = opening + timedelta(hours=hour, minutes=minute)
            world.roster({"A": ("Alice", fans["A"]), "B": ("Bob", fans["B"]), "C": ("Cara", fans["C"])}).sync()
    h = history(world)
    assert len(h.lines) == 24  # 23 stored hours plus the live line
    assert h.total == sum(line.gain for line in h.lines) == daily_total(world)
    assert h.total == h.lines[-1].since_reset


def test_table_labels_missed_hours_and_the_day_end():
    start, end = utc("2026-11-03 15:00"), utc("2026-11-04 15:00")
    rows = [("A", start, 100), ("A", utc("2026-11-03 18:00"), 400), ("A", end, 460)]
    table = hourly_table(build_history(rows, None, start, end, end))
    assert "18:00 (3h)" in table and "15:00 (21h)" in table
    assert table.splitlines()[-2].endswith("+360") and "Total" in table.splitlines()[-2]


def test_command_shows_the_table_total_and_footer(world):
    two_members_for_a_morning(world)
    reply = cmd_fan_gain_history(world.service, "club1")
    (embed,) = reply.embeds
    assert embed.title == "Club 1 · Hourly fan gain · Wed 04 Nov"  # the game day, not the UTC date
    for text in ("16:00", "+500", "17:00", "+1,200", "17:40*", "Total", "+1,300", "still in progress", "Resets"):
        assert text in embed.description


def test_command_for_both_clubs_gives_one_embed_each(world):
    two_members_for_a_morning(world)
    reply = cmd_fan_gain_history(world.service, "both")
    assert [e.title.split(" · ")[0] for e in reply.embeds] == ["Club 1", "Club 2"]


def test_command_before_any_data_says_so(world):
    (embed,) = cmd_fan_gain_history(world.service, "club1").embeds
    assert "No hourly data yet" in embed.description and "Data not loaded yet" in embed.description


def test_command_rejects_unknown_club_and_day(world):
    assert cmd_fan_gain_history(world.service, "club9").ephemeral
    assert cmd_fan_gain_history(world.service, "club1", "tomorrow").ephemeral


# ---- one member's own hourly gain (the same command, with a user or yourself) ----


def member_history(world, trainer_id, day="today"):
    return world.service.trainer_fan_gain_history(trainer_id, day)


def test_one_members_lines_use_only_their_own_totals(world):
    two_members_for_a_morning(world)
    a = member_history(world, "A").history
    assert summary(a) == [
        ("16:00", 1, 300, 300, False),
        ("17:00", 1, 400, 700, False),
        ("17:40", 0, 50, 750, True),
    ]
    assert member_history(world, "A").trainer_name == "Alice"
    assert a.total == world.gain("A", "daily")[0] == 750  # the same number /fan_gain shows


def test_members_add_up_to_the_club(world):
    two_members_for_a_morning(world)
    totals = [member_history(world, t).history.total for t in ("A", "B")]
    assert totals == [750, 550]
    assert sum(totals) == history(world).total == daily_total(world)


def test_a_member_who_joined_today_has_no_hourly_gains_yet(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 1000)}).sync()
    world.at("2026-11-04 02:05").roster({"A": ("Alice", 1200), "B": ("Bob", 5000)}).sync()  # Bob joins
    world.at("2026-11-04 03:05").roster({"A": ("Alice", 1250), "B": ("Bob", 5400)}).sync()
    bob = member_history(world, "B").history
    assert not bob.counted and bob.lines == ()
    assert member_history(world, "A").history.counted


def test_a_member_who_left_has_no_history(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 1000), "C": ("Cara", 5000)}).sync()
    world.at("2026-11-04 01:05").roster({"A": ("Alice", 1100)}).sync()  # Cara has left
    assert member_history(world, "C") is None


def test_command_shows_your_own_hours_when_you_pick_nothing(world):
    two_members_for_a_morning(world)
    world.service.link("111", "A")
    (embed,) = cmd_fan_gain_history(world.service, None, "today", "111").embeds
    assert embed.title == "Alice · Hourly fan gain · Wed 04 Nov"
    for text in ("Club 1", "16:00", "+300", "+700", "17:40*", "+750", "Resets"):
        assert text in embed.description
    assert "Current members only" not in embed.description  # that note is for the club view


def test_command_can_look_up_another_user(world):
    two_members_for_a_morning(world)
    world.service.link("222", "B")
    (embed,) = cmd_fan_gain_history(world.service, None, "today", "111", "222").embeds
    assert embed.title.startswith("Bob · ") and "+550" in embed.description


def test_command_says_when_the_member_joined_today(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 1000)}).sync()
    world.at("2026-11-04 02:05").roster({"A": ("Alice", 1200), "B": ("Bob", 5000)}).sync()
    world.service.link("222", "B")
    (embed,) = cmd_fan_gain_history(world.service, None, "today", "222").embeds
    assert "Joined during this day" in embed.description and "```" not in embed.description


def test_command_member_errors(world):
    two_members_for_a_morning(world)
    assert "haven't linked" in cmd_fan_gain_history(world.service, None, "today", "999").content
    assert "hasn't linked" in cmd_fan_gain_history(world.service, None, "today", "111", "999").content
    both = cmd_fan_gain_history(world.service, "club1", "today", "111", "222")
    assert both.ephemeral and "not both" in both.content
    assert cmd_fan_gain_history(world.service, None).ephemeral  # nothing to go on


def test_member_yesterday_works_too(world):
    world.at("2026-11-03 15:05").roster({"A": ("Alice", 100)}).sync()
    world.at("2026-11-04 03:05").roster({"A": ("Alice", 400)}).sync()
    world.at("2026-11-04 15:05").roster({"A": ("Alice", 460)}).sync()
    world.at("2026-11-04 15:30")
    view = member_history(world, "A", "yesterday")
    assert summary(view.history) == [("03:00", 12, 300, 300, False), ("15:00", 12, 60, 360, False)]
