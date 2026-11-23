"""The roster summary log: counts and timestamps only, no names, and not on every sync."""

from __future__ import annotations

import copy
import logging

from fantracker.models import ClubSnapshot, SourceMember
from fantracker.sources.umamoe import UmaMoeSource, roster_summary

KEY = "test-secret-key"

PAYLOAD = {
    "circle": {
        "circle_id": 974470619,
        "name": "Lily Club",
        "member_count": 3,
        "last_updated": "2026-11-23T05:00:00Z",
    },
    "members": [
        {
            "viewer_id": 111,
            "trainer_name": "SecretName",
            "daily_fans": [0, 400],
            "last_updated": "2026-11-23T04:00:00Z",
        },
        {"viewer_id": 222, "trainer_name": None, "daily_fans": [900], "last_updated": "2026-11-22T20:00:00Z"},
        {"viewer_id": 333, "trainer_name": "NewJoiner", "daily_fans": [0] * 31, "last_updated": None},
    ],
}


class FakeResponse:
    status_code = 200

    def __init__(self, body):
        self._body = body

    def json(self):
        return self._body


class FakeSession:
    def __init__(self, body):
        self.body = body

    def get(self, url, **kwargs):
        return FakeResponse(self.body)


class Collect(logging.Handler):
    def __init__(self):
        super().__init__(logging.INFO)
        self.messages: list[str] = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def source(body, clock):
    handler = Collect()
    log = logging.getLogger("fantracker.sources.umamoe")
    log.setLevel(logging.INFO)
    log.addHandler(handler)
    return UmaMoeSource(KEY, session=FakeSession(body), clock=clock), handler, log


def test_summary_has_counts_and_timestamps_but_no_names():
    snap = ClubSnapshot("974470619", [SourceMember("111", "SecretName", 400), SourceMember("222", "222", 900)])
    counts, text = roster_summary(PAYLOAD, snap)
    assert counts == (3, 3, 2)
    assert "member_count=3, listed=3, with fan data=2" in text
    assert "oldest=2026-11-22T20:00:00Z newest=2026-11-23T04:00:00Z" in text
    assert "circle last_updated=2026-11-23T05:00:00Z" in text
    assert "SecretName" not in text and "111" not in text


def test_summary_is_logged_once_then_when_counts_change_or_half_an_hour_passes():
    now = [0.0]
    src, handler, log = source(PAYLOAD, lambda: now[0])
    try:
        src.fetch_club("974470619")
        now[0] = 300
        src.fetch_club("974470619")  # same counts, five minutes later: quiet
        assert len(handler.messages) == 1
        now[0] = 1900
        src.fetch_club("974470619")  # half an hour has passed
        assert len(handler.messages) == 2
        changed = copy.deepcopy(PAYLOAD)
        changed["circle"]["member_count"] = 2
        src._session = FakeSession(changed)
        now[0] = 1960
        src.fetch_club("974470619")  # the numbers changed
        assert len(handler.messages) == 3 and "member_count=2" in handler.messages[-1]
    finally:
        log.removeHandler(handler)
