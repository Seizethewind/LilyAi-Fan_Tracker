"""Only one club is tracked: rows left over from a club we dropped must not show up."""

from __future__ import annotations

from fantracker.services.tracker import TrackerService
from tests.conftest import CLUB1, CLUB2


def test_a_trainer_only_on_a_club_we_do_not_track_cannot_link(world):
    world.roster({"A": ("Alice", 100)}).sync()
    world.roster({"T": ("Tina", 50), "900": ("Other", 10)}, club=CLUB2).sync()
    only_club1 = TrackerService(world.store, world.source, [CLUB1], clock=lambda: world.now)
    assert only_club1.link("1", "T").status == "not_found"
    assert only_club1.link("1", "A").status == "linked"
