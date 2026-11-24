"""The fan-gain rules the project asked for, one scenario per rule.

Calendar used: 2026-11-02 is a Monday, 2026-11-04 a Wednesday,
2026-11-08 a Sunday, 2026-11-09 the next Monday.

A game day starts at 15:00 UTC (00:00 JST), so "2026-11-03 15:05" is the first sync of Wed 4 Nov.
"""

from __future__ import annotations

from datetime import timedelta

from fantracker.sources.base import SourceError
from tests.conftest import CLUB1, CLUB2, utc


def test_gain_accumulates_across_periods(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 100)}).sync()
    world.at("2026-11-04 12:00").roster({"A": ("Alice", 150)}).sync()
    assert [world.gain("A", p) for p in ("daily", "weekly", "monthly")] == [(50, True)] * 3

    world.at("2026-11-05 00:05").roster({"A": ("Alice", 150)}).sync()
    world.at("2026-11-05 12:00").roster({"A": ("Alice", 200)}).sync()
    assert world.gain("A", "daily") == (50, True)
    assert world.gain("A", "weekly") == (100, True)
    assert world.gain("A", "monthly") == (100, True)


def test_weekly_resets_on_monday_at_the_game_reset(world):
    world.at("2026-11-03 15:05").roster({"A": ("Alice", 100)}).sync()  # Wed 4 Nov 00:05 JST
    world.at("2026-11-07 15:05").roster({"A": ("Alice", 300)}).sync()  # Sun 8 Nov 00:05 JST
    world.at("2026-11-08 14:55").roster({"A": ("Alice", 500)}).sync()  # Sun 8 Nov 23:55 JST
    assert world.gain("A", "weekly") == (400, True)  # still the week that began Monday 11-02
    assert world.gain("A", "daily") == (200, True)

    world.at("2026-11-08 15:05").roster({"A": ("Alice", 500)}).sync()  # Mon 9 Nov 00:05 JST
    assert world.gain("A", "weekly") == (0, True)
    assert world.gain("A", "daily") == (0, True)

    world.at("2026-11-09 03:00").roster({"A": ("Alice", 550)}).sync()
    assert world.gain("A", "weekly") == (50, True)
    assert world.gain("A", "monthly") == (450, True)  # the month did not reset


def test_monthly_resets_at_the_first_game_reset(world):
    world.at("2026-10-30 15:05").roster({"A": ("Alice", 1000)}).sync()  # Sat 31 Oct 00:05 JST
    world.at("2026-10-31 14:50").roster({"A": ("Alice", 1400)}).sync()  # Sat 31 Oct 23:50 JST
    assert world.gain("A", "monthly") == (400, True)

    world.at("2026-10-31 15:05").roster({"A": ("Alice", 1400)}).sync()  # Sun 1 Nov 00:05 JST
    world.at("2026-11-01 03:00").roster({"A": ("Alice", 1500)}).sync()
    assert world.gain("A", "monthly") == (100, True)  # October's gain is gone
    assert world.gain("A", "weekly") == (100, True)  # and the week October began stopped with it


def test_total_below_baseline_means_the_tally_was_reset(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 5000)}).sync()
    world.at("2026-11-04 12:00").roster({"A": ("Alice", 300)}).sync()
    assert world.gain("A", "daily") == (300, True)


def test_join_day_is_zero_then_counts_from_the_next_day(world):
    world.at("2026-11-03 15:05").roster({"A": ("Alice", 100)}).sync()  # first sync of Wed 4 Nov
    world.at("2026-11-04 03:00").roster({"A": ("Alice", 150), "B": ("Bob", 1000)}).sync()
    world.at("2026-11-04 09:00").roster({"A": ("Alice", 160), "B": ("Bob", 1100)}).sync()
    for period in ("daily", "weekly", "monthly"):
        assert world.gain("B", period) == (0, False)  # join day: zero, however many fans were earned

    world.at("2026-11-04 15:05").roster({"A": ("Alice", 160), "B": ("Bob", 1100)}).sync()  # Thu 5 Nov 00:05 JST
    world.at("2026-11-05 03:00").roster({"A": ("Alice", 170), "B": ("Bob", 1150)}).sync()
    for period in ("daily", "weekly", "monthly"):
        assert world.gain("B", period) == (50, True)


def test_member_who_leaves_is_removed_but_keeps_their_link(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 100), "B": ("Bob", 200)}).sync()
    assert world.service.link("42", "B").status == "linked"

    world.at("2026-11-04 12:00").roster({"A": ("Alice", 110)}).sync()
    assert world.on_roster() == ["A"]
    assert world.store.find_active_member("B") is None
    assert world.service.linked_trainer("42") == "B"


def test_rejoin_in_the_same_month_restores_the_original_baseline(world):
    both = {"A": ("Alice", 100), "B": ("Bob", 1000)}
    world.at("2026-11-04 00:05").roster(both).sync()
    world.at("2026-11-05 12:00").roster({"A": ("Alice", 120)}).sync()  # B leaves
    assert world.on_roster() == ["A"]

    world.at("2026-11-07 00:05").roster({"A": ("Alice", 125)}).sync()  # Saturday's first sync: B still away
    world.at("2026-11-07 12:00").roster({"A": ("Alice", 130), "B": ("Bob", 1400)})
    world.sync()
    assert world.gain("B", "daily") == (0, False)  # rejoin day counts as zero
    assert world.gain("B", "weekly") == (400, True)  # as if they never left
    assert world.gain("B", "monthly") == (400, True)


def test_rejoin_in_a_later_month_is_treated_as_a_new_player(world):
    world.at("2026-10-28 00:05").roster({"A": ("Alice", 100), "B": ("Bob", 500)}).sync()
    world.at("2026-10-29 12:00").roster({"A": ("Alice", 110)}).sync()  # B leaves in October

    world.at("2026-11-02 00:05").roster({"A": ("Alice", 115)}).sync()  # the day's first sync: B not back yet
    world.at("2026-11-02 12:00").roster({"A": ("Alice", 120), "B": ("Bob", 900)}).sync()
    assert world.gain("B", "monthly") == (0, False)  # October history does not count

    world.at("2026-11-03 00:05").roster({"A": ("Alice", 120), "B": ("Bob", 900)}).sync()
    world.at("2026-11-03 12:00").roster({"A": ("Alice", 125), "B": ("Bob", 950)}).sync()
    assert world.gain("B", "monthly") == (50, True)


def test_snapshot_is_taken_only_on_the_first_sync_of_the_day(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 100)})
    first = world.sync()
    world.at("2026-11-04 12:00").roster({"A": ("Alice", 150)})
    second = world.sync()
    assert first[0].result.took_day_snapshot is True
    assert second[0].result.took_day_snapshot is False
    assert world.db.execute("SELECT fans FROM day_snapshots WHERE club_id = ?", (CLUB1.club_id,)) == [(100,)]


def test_empty_roster_is_refused_and_nobody_is_marked_as_left(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 100)}).sync()
    world.at("2026-11-04 12:00").roster({})
    outcomes = world.sync()
    assert outcomes[0].ok is False
    assert world.on_roster() == ["A"]
    assert "empty roster" in world.store.club_info(CLUB1.club_id).last_error


def test_one_club_failing_does_not_stop_the_other(world):
    world.roster({"A": ("Alice", 100)})
    world.source.errors[CLUB1.club_id] = SourceError("boom")
    outcomes = world.sync()
    assert [(o.club_key, o.ok) for o in outcomes] == [("club1", False), ("club2", True)]
    assert world.store.club_info(CLUB1.club_id).last_error == "boom"
    assert world.store.club_info(CLUB2.club_id).member_count == 1


def test_unexpected_error_is_reported_without_detail(world):
    world.roster({"A": ("Alice", 100)})
    world.source.errors[CLUB1.club_id] = RuntimeError("secret-looking detail")
    outcome = world.sync()[0]
    assert outcome.ok is False
    assert "secret-looking" not in outcome.error
    assert "RuntimeError" in outcome.error


def test_successful_sync_clears_the_recorded_error(world):
    world.roster({"A": ("Alice", 100)})
    world.source.errors[CLUB1.club_id] = SourceError("boom")
    world.sync()
    del world.source.errors[CLUB1.club_id]
    world.sync()
    assert world.store.club_info(CLUB1.club_id).last_error is None


def test_ranking_order_and_top_limit(world):
    world.at("2026-11-04 00:05").roster(
        {"A": ("Alice", 100), "B": ("Bob", 100), "C": ("Cara", 100), "D": ("Dan", 100)}
    ).sync()
    world.at("2026-11-04 12:00").roster(
        {"A": ("Alice", 130), "B": ("Bob", 190), "C": ("Cara", 130), "D": ("Dan", 110)}
    ).sync()
    board = world.service.leaderboard(CLUB1, "daily", 3)
    assert [(r.rank, r.trainer_id, r.gain) for r in board.rows] == [(1, "B", 90), (2, "A", 30), (3, "C", 30)]
    assert world.service.leaderboard(CLUB1, "daily", 999).top == 30  # capped at a full club


def test_sync_reports_who_joined_and_left(world):
    world.roster({"A": ("Alice", 100), "B": ("Bob", 100)})
    first = world.sync()[0].result
    assert sorted(first.joined) == ["A", "B"]
    world.at("2026-11-04 12:00").roster({"B": ("Bob", 110), "C": ("Cara", 5)})
    second = world.sync()[0].result
    assert second.joined == ["C"] and second.left == ["A"]


def test_member_moving_between_clubs(world):
    world.roster({"T": ("Tina", 100), "A": ("Alice", 100)}).sync()
    assert world.store.find_active_member("T")[0] == CLUB1.club_id
    world.at("2026-11-04 12:00").roster({"A": ("Alice", 110)})
    world.roster({"T": ("Tina", 120)}, club=CLUB2).sync()
    assert world.store.find_active_member("T")[0] == CLUB2.club_id
    assert world.on_roster(CLUB1) == ["A"]


def test_standing_includes_rank_and_roster_size(world):
    world.at("2026-11-04 00:05").roster({"A": ("Alice", 100), "B": ("Bob", 100)}).sync()
    world.at("2026-11-04 12:00").roster({"A": ("Alice", 110), "B": ("Bob", 150)}).sync()
    standing = world.service.standing_for_trainer("A", "daily")
    assert (standing.row.rank, standing.roster_size, standing.club.key) == (2, 2, "club1")
    assert world.service.standing_for_trainer("nobody", "daily") is None


# ---- audit: the same fans counted over different spans must reconcile ----


def test_audit_daily_gains_add_up_to_weekly_and_monthly(world):
    opening = utc("2026-11-03 15:05")  # first sync of game day Wed 4 Nov (00:05 JST)
    fans = {"A": 1000, "B": 5000}
    step = {"A": 10, "B": 7}
    daily = []  # each game day's gain, read just before the next reset
    weekly_on_sunday = {}
    for day in range(10):  # Wed 4 Nov to Fri 13 Nov; the Monday 9 Nov reset falls in between
        world.now = opening + timedelta(days=day)
        world.roster({t: (t, f) for t, f in fans.items()}).sync()
        for trainer in fans:
            fans[trainer] += step[trainer] * (day + 1)
        world.now = opening + timedelta(days=day, hours=23, minutes=50)  # 14:55 UTC, before the next reset
        world.roster({t: (t, f) for t, f in fans.items()}).sync()
        daily.append({t: world.gain(t, "daily")[0] for t in fans})
        if day == 4:  # Sun 8 Nov, the last day of the first week
            weekly_on_sunday = {t: world.gain(t, "weekly")[0] for t in fans}
    for trainer in fans:
        assert [d[trainer] for d in daily] == [step[trainer] * (n + 1) for n in range(10)]  # what was earned
        assert weekly_on_sunday[trainer] == sum(d[trainer] for d in daily[:5])  # Wed to Sun
        assert world.gain(trainer, "weekly")[0] == sum(d[trainer] for d in daily[5:])  # Mon to Fri
        assert world.gain(trainer, "monthly")[0] == sum(d[trainer] for d in daily)  # every day of the month


def test_a_week_cut_by_the_month_end_stops_there(world):
    """March 2026 ends on a Tuesday: Mon 30 and Tue 31 make one short week, and Wed 1 Apr starts a new one."""
    for at, fans in (
        ("2026-03-29 15:05", 100),  # Mon 30 Mar 00:05 JST
        ("2026-03-30 14:55", 160),
        ("2026-03-30 15:05", 160),  # Tue 31 Mar 00:05 JST
        ("2026-03-31 14:55", 220),
    ):
        world.at(at).roster({"A": ("Alice", fans)}).sync()
    assert world.gain("A", "weekly") == (120, True)  # Monday and Tuesday
    assert world.gain("A", "monthly") == (120, True)

    world.at("2026-03-31 15:05").roster({"A": ("Alice", 220)}).sync()  # Wed 1 Apr 00:05 JST
    assert [world.gain("A", p) for p in ("daily", "weekly", "monthly")] == [(0, True)] * 3

    world.at("2026-04-01 03:00").roster({"A": ("Alice", 260)}).sync()
    assert [world.gain("A", p) for p in ("daily", "weekly", "monthly")] == [(40, True)] * 3

    world.at("2026-04-05 14:55").roster({"A": ("Alice", 300)}).sync()  # Sun 5 Apr, the short week's last day
    assert world.gain("A", "weekly") == (80, True)  # Wednesday to Sunday

    world.at("2026-04-05 15:05").roster({"A": ("Alice", 300)}).sync()  # Mon 6 Apr: a normal Monday reset
    assert world.gain("A", "weekly") == (0, True)
    assert world.gain("A", "monthly") == (80, True)
