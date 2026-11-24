"""uma.moe client: reads one circle (club) roster from the uma.moe API.

Every endpoint, header and field below comes from the OpenAPI spec at
https://uma.moe/api/docs/openapi.yaml (version 1.0.0, read on 2026-11-22):

* ``GET /api/v4/circles?circle_id=<id>`` returns a ``CircleResponse`` with ``circle``
  (``circle_id``, ``name``, ...) and ``members``. The spec lists no pagination
  parameters for it.
* Authentication is an ``X-API-Key`` header.
* Each member row has ``viewer_id`` (the trainer ID), ``trainer_name`` (nullable) and
  ``daily_fans``, described as a "31-element array of cumulative daily fan totals".

Not stated by the spec, so an assumption: which element is "today". The current total is
taken as the last non-zero element. This has not been checked against the live service.
See docs/UMAMOE.md.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable
from typing import Any

import requests

from fantracker.models import ClubSnapshot, SourceMember
from fantracker.sources.base import SourceError

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://uma.moe"
CIRCLES_PATH = "/api/v4/circles"
DEFAULT_TIMEOUT_SECONDS = 15.0
SUMMARY_LOG_SECONDS = 1800  # repeat the roster summary at most this often while its counts stay the same

_CLUB_ID = re.compile(r"\d{1,20}")


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def current_fans(daily_fans: Any) -> int | None:
    """Latest cumulative fan total in a ``daily_fans`` array, or None if there is none yet."""
    if not isinstance(daily_fans, list):
        return None
    latest: int | None = None
    for value in daily_fans:
        if _is_int(value) and value > 0:
            latest = value
    return latest


def parse_circle_response(payload: Any, club_id: str) -> ClubSnapshot:
    """Turn a ``CircleResponse`` into a ClubSnapshot. Raises SourceError if it is unusable."""
    if not isinstance(payload, dict):
        raise SourceError("uma.moe returned an unexpected response (not a JSON object)")
    circle = payload.get("circle")
    rows = payload.get("members")
    if not isinstance(circle, dict) or not isinstance(rows, list):
        raise SourceError("uma.moe response is missing 'circle' or 'members'")
    if str(circle.get("circle_id")) != club_id:
        raise SourceError(f"uma.moe returned circle {circle.get('circle_id')!r} instead of {club_id}")

    members: list[SourceMember] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict) or not _is_int(row.get("viewer_id")):
            raise SourceError("uma.moe member row has no numeric viewer_id")
        trainer_id = str(row["viewer_id"])
        if trainer_id in seen:
            raise SourceError(f"uma.moe listed trainer {trainer_id} twice")
        seen.add(trainer_id)
        fans = current_fans(row.get("daily_fans"))
        if fans is None:
            continue  # no fan total yet this month; it appears once uma.moe has one
        name = row.get("trainer_name")
        name = name.strip() if isinstance(name, str) and name.strip() else trainer_id
        stamp = row.get("last_updated")
        updated = stamp if isinstance(stamp, str) else None
        members.append(SourceMember(trainer_id=trainer_id, name=name, fans=fans, updated=updated))

    if not members:
        # An empty roster would make the tracker think everyone left, so fail the sync instead.
        raise SourceError("uma.moe has no fan totals for any member yet (new month?)")

    club_name = circle.get("name")
    return ClubSnapshot(
        club_id=club_id,
        members=members,
        club_name=club_name if isinstance(club_name, str) and club_name.strip() else None,
    )


def roster_summary(payload: dict[str, Any], snapshot: ClubSnapshot) -> tuple[tuple[Any, ...], str]:
    """Counts and timestamps that show how fresh uma.moe's roster is. No names or trainer IDs.

    Returns (counts, text). The counts change when the roster changes; the text also holds
    the timestamps.
    """
    circle = payload["circle"]
    rows = payload["members"]
    stamps = sorted(str(r["last_updated"]) for r in rows if isinstance(r, dict) and r.get("last_updated"))
    counts = (circle.get("member_count"), len(rows), len(snapshot.members))
    text = (
        f"uma.moe club {snapshot.club_id}: member_count={counts[0]}, listed={counts[1]}, "
        f"with fan data={counts[2]}, circle last_updated={circle.get('last_updated')}, "
        f"member last_updated oldest={stamps[0] if stamps else None} newest={stamps[-1] if stamps else None}"
    )
    return counts, text


def _http_error(response: Any) -> str:
    detail = ""
    try:
        body = response.json()
        if isinstance(body, dict) and isinstance(body.get("error"), str):
            detail = ": " + body["error"][:200]
    except ValueError:
        pass
    hint = " (check UMAMOE_API_KEY)" if response.status_code in (401, 403) else ""
    return f"uma.moe answered HTTP {response.status_code}{detail}{hint}"


class UmaMoeSource:
    """FanSource backed by the uma.moe API. The API key is sent only in the X-API-Key header."""

    def __init__(
        self,
        api_key: str | None,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        session: Any = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not api_key:
            raise SourceError("UMAMOE_API_KEY is not set")
        self._api_key = api_key
        self._url = base_url.rstrip("/") + CIRCLES_PATH
        self._timeout = timeout
        self._session = session if session is not None else requests.Session()
        self._clock = clock
        self._last_summary: dict[str, tuple[tuple[Any, ...], float]] = {}

    def _log_summary(self, payload: dict[str, Any], snapshot: ClubSnapshot) -> None:
        """Log how fresh the roster is: when its counts change, and otherwise every half hour."""
        counts, text = roster_summary(payload, snapshot)
        now = self._clock()
        last = self._last_summary.get(snapshot.club_id)
        if last is None or last[0] != counts or now - last[1] >= SUMMARY_LOG_SECONDS:
            self._last_summary[snapshot.club_id] = (counts, now)
            logger.info(text)

    def fetch_club(self, club_id: str) -> ClubSnapshot:
        club_id = str(club_id).strip()
        if not _CLUB_ID.fullmatch(club_id):
            raise SourceError("club id must be numeric")
        try:
            response = self._session.get(
                self._url,
                params={"circle_id": club_id},
                headers={"X-API-Key": self._api_key, "Accept": "application/json"},
                timeout=self._timeout,
            )
        except requests.RequestException as exc:
            raise SourceError(f"uma.moe request failed ({type(exc).__name__})") from exc
        if response.status_code != 200:
            raise SourceError(_http_error(response))
        try:
            payload = response.json()
        except ValueError as exc:
            raise SourceError("uma.moe returned invalid JSON") from exc
        snapshot = parse_circle_response(payload, club_id)
        self._log_summary(payload, snapshot)
        return snapshot
