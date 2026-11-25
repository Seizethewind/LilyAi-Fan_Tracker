"""uma.moe client: parsing and request handling.

MOCKED. The fixture below is hand-written to match the CircleResponse schema in
https://uma.moe/api/docs/openapi.yaml. It is NOT a captured live response, so passing
these tests does not prove the live service behaves the same way.
"""

from __future__ import annotations

import copy

import pytest
import requests

from fantracker.config import load_settings
from fantracker.sources import SourceError, build_source
from fantracker.sources.umamoe import UmaMoeSource, current_fans, daily_fans_sample, parse_circle_response

KEY = "test-secret-key"

CIRCLE_RESPONSE = {
    "circle": {"circle_id": 974470619, "name": "Lily Club", "member_count": 3},
    "members": [
        {
            "viewer_id": 111111111,
            "trainer_name": "Alice",
            "year": 2026,
            "month": 11,
            "daily_fans": [100, 250, 400] + [0] * 28,
        },
        {
            "viewer_id": 222222222,
            "trainer_name": None,
            "year": 2026,
            "month": 11,
            "daily_fans": [0, 0, 900] + [0] * 28,
        },
        {
            "viewer_id": 333333333,
            "trainer_name": "NewJoiner",
            "year": 2026,
            "month": 11,
            "daily_fans": [0] * 31,
        },
    ],
}


class FakeResponse:
    def __init__(self, status_code=200, body=None, bad_json=False):
        self.status_code = status_code
        self._body = body
        self._bad_json = bad_json

    def json(self):
        if self._bad_json:
            raise ValueError("not json")
        return self._body


class FakeSession:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls: list[dict] = []

    def get(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        if self.error:
            raise self.error
        return self.response


def source(response=None, error=None):
    session = FakeSession(response, error)
    return UmaMoeSource(KEY, session=session), session


# ---- parsing ----------------------------------------------------------


def test_current_fans_is_the_last_non_zero_total():
    assert current_fans([5, 10, 0, 0]) == 10
    assert current_fans([0, 0, 0]) is None
    assert current_fans([]) is None
    assert current_fans(None) is None
    assert current_fans([None, 7, None]) == 7


def test_parse_maps_ids_names_and_fans():
    snap = parse_circle_response(CIRCLE_RESPONSE, "974470619")
    assert snap.club_id == "974470619" and snap.club_name == "Lily Club"
    assert [(m.trainer_id, m.name, m.fans) for m in snap.members] == [
        ("111111111", "Alice", 400),
        ("222222222", "222222222", 900),  # null trainer_name falls back to the ID
    ]  # the member with no fan data yet is left out


def test_parse_rejects_a_roster_with_no_fan_data():
    payload = copy.deepcopy(CIRCLE_RESPONSE)
    for row in payload["members"]:
        row["daily_fans"] = [0] * 31
    with pytest.raises(SourceError, match="no fan totals"):
        parse_circle_response(payload, "974470619")


def test_parse_rejects_an_empty_member_list():
    payload = {"circle": CIRCLE_RESPONSE["circle"], "members": []}
    with pytest.raises(SourceError):
        parse_circle_response(payload, "974470619")


def test_parse_rejects_a_different_circle():
    with pytest.raises(SourceError, match="instead of"):
        parse_circle_response(CIRCLE_RESPONSE, "325938032")


@pytest.mark.parametrize(
    "payload",
    [
        [],
        "oops",
        {},
        {"circle": {}, "members": "x"},
        {"circle": {"circle_id": 974470619}, "members": [{"trainer_name": "no id"}]},
    ],
)
def test_parse_rejects_unexpected_shapes(payload):
    with pytest.raises(SourceError):
        parse_circle_response(payload, "974470619")


def test_parse_rejects_duplicate_trainers():
    payload = copy.deepcopy(CIRCLE_RESPONSE)
    payload["members"].append(copy.deepcopy(payload["members"][0]))
    with pytest.raises(SourceError, match="twice"):
        parse_circle_response(payload, "974470619")


# ---- requests ---------------------------------------------------------


def test_fetch_club_sends_the_documented_request():
    src, session = source(FakeResponse(200, CIRCLE_RESPONSE))
    snap = src.fetch_club("974470619")
    assert len(snap.members) == 2
    (call,) = session.calls
    assert call["url"] == "https://uma.moe/api/v4/circles"
    assert call["params"] == {"circle_id": "974470619"}
    assert call["headers"]["X-API-Key"] == KEY
    assert call["timeout"] > 0


@pytest.mark.parametrize("status", [401, 403, 404, 429, 500])
def test_http_errors_become_source_errors_without_the_key(status):
    src, _ = source(FakeResponse(status, {"error": "nope", "status": status}))
    with pytest.raises(SourceError) as info:
        src.fetch_club("974470619")
    assert str(status) in str(info.value) and KEY not in str(info.value)


def test_auth_failures_point_at_the_api_key_setting():
    src, _ = source(FakeResponse(401, {"error": "bad key", "status": 401}))
    with pytest.raises(SourceError, match="UMAMOE_API_KEY"):
        src.fetch_club("974470619")


def test_network_errors_become_source_errors_without_the_key():
    src, _ = source(error=requests.ConnectionError(f"boom {KEY}"))
    with pytest.raises(SourceError) as info:
        src.fetch_club("974470619")
    assert "ConnectionError" in str(info.value) and KEY not in str(info.value)


def test_timeouts_become_source_errors():
    src, _ = source(error=requests.Timeout())
    with pytest.raises(SourceError, match="Timeout"):
        src.fetch_club("974470619")


def test_invalid_json_becomes_a_source_error():
    src, _ = source(FakeResponse(200, bad_json=True))
    with pytest.raises(SourceError, match="invalid JSON"):
        src.fetch_club("974470619")


@pytest.mark.parametrize("club_id", ["", "abc", "1 2", "../x"])
def test_non_numeric_club_ids_never_reach_the_network(club_id):
    src, session = source(FakeResponse(200, CIRCLE_RESPONSE))
    with pytest.raises(SourceError):
        src.fetch_club(club_id)
    assert session.calls == []


# ---- wiring -----------------------------------------------------------


def test_build_source_returns_the_client_when_a_key_is_set():
    assert isinstance(build_source(load_settings({"UMAMOE_API_KEY": KEY})), UmaMoeSource)


def test_build_source_without_a_key_is_a_clear_error():
    with pytest.raises(SourceError, match="UMAMOE_API_KEY"):
        build_source(load_settings({}))


def test_parse_keeps_each_rows_last_updated():
    payload = copy.deepcopy(CIRCLE_RESPONSE)
    payload["members"][0]["last_updated"] = "2026-11-24T10:21:47Z"
    by_id = {m.trainer_id: m for m in parse_circle_response(payload, "974470619").members}
    assert by_id["111111111"].updated == "2026-11-24T10:21:47Z"
    assert by_id["222222222"].updated is None


def test_current_club_asks_by_viewer_id_and_reads_the_circle():
    src, session = source(FakeResponse(200, CIRCLE_RESPONSE))
    assert src.current_club("111111111") == "974470619"
    assert session.calls[0]["params"] == {"viewer_id": "111111111"}
    assert session.calls[0]["headers"]["X-API-Key"] == KEY


@pytest.mark.parametrize(
    "response",
    [FakeResponse(404, {"error": "no", "status": 404}), FakeResponse(200, {}), FakeResponse(200, bad_json=True)],
)
def test_current_club_is_none_when_uma_moe_cannot_say(response):
    src, _ = source(response)
    assert src.current_club("111111111") is None


def test_current_club_never_sends_a_non_numeric_id():
    src, session = source(FakeResponse(200, CIRCLE_RESPONSE))
    assert src.current_club("../x") is None and session.calls == []


def test_daily_fans_sample_shows_the_biggest_members_first():
    sample = daily_fans_sample(CIRCLE_RESPONSE, top=2)
    assert sample == "222222222: days=1 first=900 last2=[900]; Alice: days=3 first=100 last2=[250, 400]"
