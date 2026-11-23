"""The daily fan quota warning.

All MOCKED: a fake data source, in-memory SQLite, a fake router and fake Discord posting. These prove
the logic; they do not prove the real router or a real Discord channel accept the messages.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import discord
import pytest

from fantracker.config import ConfigError, load_settings
from fantracker.discord_bot import DiscordRunner
from fantracker.llm import AiAssistant, RouterError
from fantracker.quota import build_quota_posts, fallback_intro
from fantracker.runner import run_quota_warning
from fantracker.timeutil import next_daily_time
from tests.conftest import CLUB2, utc

AGE = timedelta(minutes=15)


def quota_world(world):
    """Club 1 on 2026-11-04, checked at 22:00 UTC with a quota of 100 fans."""
    start = {"A": ("Alice", 1000), "B": ("Bob", 1000), "C": ("Cara", 1000), "D": ("Dan", 1000)}
    world.at("2026-11-04 00:05").roster(start).roster({"X": ("Xan", 1000)}, club=CLUB2).sync()
    evening = {"A": ("Alice", 1150), "B": ("Bob", 1040), "C": ("Cara", 1100), "D": ("Dan", 1010), "N": ("New", 10)}
    world.at("2026-11-04 21:58").roster(evening).roster({"X": ("Xan", 1500)}, club=CLUB2).sync()
    return world.at("2026-11-04 22:00")


class FakeClient:
    def __init__(self, reply: str = "Please catch up!", error: Exception | None = None) -> None:
        self.reply, self.error, self.calls = reply, error, []

    def chat(self, messages):
        self.calls.append(messages)
        if self.error:
            raise self.error
        return self.reply


def assistant(client) -> AiAssistant:
    return AiAssistant(client, clock=lambda: 0.0)


# ---- who is under the quota ---------------------------------------------


def test_report_lists_only_members_under_the_quota(world):
    report = quota_world(world).service.quota_report(100, AGE)
    rows = [(s.club.key, [(r.rank, r.trainer_id, r.gain) for r in s.rows]) for s in report.shortfalls]
    # Dan (10) and Bob (40) are under; Cara is exactly on 100; Alice is over; New joined today.
    assert rows == [("club1", [(1, "D", 10), (2, "B", 40)])]
    assert report.stale == []
    assert report.resets_at == utc("2026-11-05 00:00")


def test_report_skips_clubs_whose_data_is_old(world):
    report = quota_world(world).at("2026-11-04 22:30").service.quota_report(100, AGE)
    assert report.shortfalls == []
    assert [c.key for c in report.stale] == ["club1", "club2"]


def test_report_skips_a_club_that_was_never_synced(world):
    report = world.at("2026-11-04 22:00").service.quota_report(100, AGE)
    assert [c.key for c in report.stale] == ["club1", "club2"]


# ---- the message ---------------------------------------------------------


def test_posts_use_the_router_text_then_list_names_from_the_data(world):
    client = FakeClient("Please catch up!")
    posts = build_quota_posts(quota_world(world).service, assistant(client), 100, AGE)

    assert posts[0].startswith("Please catch up!")
    assert "Resets <t:" in posts[0]
    assert len(posts) == 2
    assert posts[1].startswith("**Club 1**: 2 under 100")
    assert "Dan" in posts[1] and "Bob" in posts[1] and "Alice" not in posts[1]


def test_member_names_never_reach_the_router(world):
    client = FakeClient()
    build_quota_posts(quota_world(world).service, assistant(client), 100, AGE)
    sent = " ".join(m["content"] for m in client.calls[0])
    assert "Dan" not in sent and "Bob" not in sent
    assert "100" in sent and "2 hours" in sent and "Members still under it: 2" in sent


def test_without_a_router_the_warning_still_goes_out(world):
    posts = build_quota_posts(quota_world(world).service, None, 100, AGE)
    assert posts[0].startswith(fallback_intro(100))
    assert "Dan" in posts[1]


def test_router_failure_falls_back_and_is_not_retried_while_it_is_down(world):
    client = FakeClient(error=RouterError("router answered HTTP 401"))
    ai = assistant(client)
    service = quota_world(world).service
    first = build_quota_posts(service, ai, 100, AGE)
    second = build_quota_posts(service, ai, 100, AGE)
    assert first[0].startswith(fallback_intro(100)) and second[0].startswith(fallback_intro(100))
    assert len(client.calls) == 1  # the second warning did not hit the failing router again


def test_long_router_text_is_clipped(world):
    posts = build_quota_posts(quota_world(world).service, assistant(FakeClient("x" * 5000)), 100, AGE)
    assert len(posts[0]) < 700


def test_nobody_under_quota_posts_nothing(world):
    assert build_quota_posts(quota_world(world).service, None, 1, AGE) == []


def test_a_club_with_nobody_under_quota_is_left_out(world):
    posts = build_quota_posts(quota_world(world).service, None, 100, AGE)
    assert all(CLUB2.label not in p for p in posts)


# ---- the daily loop ------------------------------------------------------


def test_next_daily_time():
    assert next_daily_time(22, utc("2026-11-04 21:59")) == utc("2026-11-04 22:00")
    assert next_daily_time(22, utc("2026-11-04 22:00")) == utc("2026-11-05 22:00")  # strictly after
    assert next_daily_time(22, utc("2026-11-04 23:30")) == utc("2026-11-05 22:00")
    assert next_daily_time(0, utc("2026-11-04 12:00")) == utc("2026-11-05 00:00")


def _clock(*moments: datetime):
    it = iter(moments)
    return lambda: next(it)


JUST_BEFORE = datetime(2026, 11, 4, 21, 59, 59, 950_000, tzinfo=UTC)  # the loop fires 0.05s later
AFTER = datetime(2026, 11, 4, 22, 0, 5, tzinfo=UTC)  # the next run is a day away


def test_loop_refreshes_then_posts_and_retries_a_failed_post():
    async def scenario():
        stop, order, results = asyncio.Event(), [], [False, True]

        async def refresh():
            order.append("refresh")

        async def post(texts):
            order.append(("post", texts))
            ok = results.pop(0)
            if ok:
                stop.set()
            return ok

        await asyncio.wait_for(
            run_quota_warning(
                lambda: ["msg"], post, 22, stop, refresh=refresh, clock=_clock(JUST_BEFORE, AFTER), retry_seconds=0.01
            ),
            timeout=5,
        )
        return order

    assert asyncio.run(scenario()) == ["refresh", ("post", ["msg"]), ("post", ["msg"])]


def test_loop_gives_up_after_the_attempts_and_keeps_running(caplog):
    async def scenario():
        stop, posted = asyncio.Event(), []

        async def post(texts):
            posted.append(texts)
            if len(posted) == 2:
                stop.set()
            return False

        await asyncio.wait_for(
            run_quota_warning(
                lambda: ["msg"], post, 22, stop, clock=_clock(JUST_BEFORE, AFTER), retry_seconds=0.01, attempts=2
            ),
            timeout=5,
        )
        return posted

    assert len(asyncio.run(scenario())) == 2
    assert "Giving up" in caplog.text


def test_loop_posts_nothing_when_there_is_nobody_to_warn():
    async def scenario():
        stop, posted = asyncio.Event(), []

        async def refresh():
            stop.set()

        async def post(texts):
            posted.append(texts)
            return True

        await asyncio.wait_for(
            run_quota_warning(lambda: [], post, 22, stop, refresh=refresh, clock=_clock(JUST_BEFORE, AFTER)),
            timeout=5,
        )
        return posted

    assert asyncio.run(scenario()) == []


def test_loop_survives_a_failing_build(caplog):
    async def scenario():
        stop = asyncio.Event()

        async def refresh():
            stop.set()

        def build():
            raise RuntimeError("boom")

        async def post(texts):
            raise AssertionError("nothing should be posted")

        await asyncio.wait_for(
            run_quota_warning(build, post, 22, stop, refresh=refresh, clock=_clock(JUST_BEFORE, AFTER)), timeout=5
        )

    asyncio.run(scenario())
    assert "Quota warning failed" in caplog.text


def test_loop_stops_when_asked_before_the_hour():
    async def scenario():
        stop = asyncio.Event()
        stop.set()
        await asyncio.wait_for(
            run_quota_warning(lambda: ["x"], None, 22, stop, clock=_clock(utc("2026-11-04 12:00"))), timeout=5
        )

    asyncio.run(scenario())


# ---- posting to Discord --------------------------------------------------


class FakeChannel(discord.abc.Messageable):
    def __init__(self, error: Exception | None = None) -> None:
        self.sent, self.error = [], error

    async def send(self, text, *, allowed_mentions=None):
        if self.error:
            raise self.error
        self.sent.append((text, allowed_mentions))


class FakeBot:
    def __init__(self, channel) -> None:
        self.channel = channel

    def get_channel(self, channel_id):
        return self.channel

    async def fetch_channel(self, channel_id):
        return self.channel


def discord_runner(world, bot, state="ready") -> DiscordRunner:
    runner = DiscordRunner("token", world.service, load_settings({}))
    runner._bot, runner.state = bot, state
    return runner


def test_post_sends_every_message_without_pinging_anyone(world):
    channel = FakeChannel()
    assert asyncio.run(discord_runner(world, FakeBot(channel)).post(1, ["one", "two"])) is True
    assert [text for text, _ in channel.sent] == ["one", "two"]
    for _, mentions in channel.sent:
        assert (mentions.everyone, mentions.users, mentions.roles) == (False, False, False)


def test_post_reports_failure_instead_of_raising(world):
    response = type("Response", (), {"status": 403, "reason": "Forbidden"})()
    refused = FakeChannel(error=discord.Forbidden(response, "missing access"))
    assert asyncio.run(discord_runner(world, FakeBot(refused)).post(1, ["x"])) is False
    assert asyncio.run(discord_runner(world, FakeBot(object())).post(1, ["x"])) is False  # not a text channel
    assert asyncio.run(discord_runner(world, FakeBot(FakeChannel()), state="reconnecting").post(1, ["x"])) is False
    assert asyncio.run(discord_runner(world, None).post(1, ["x"])) is False


# ---- settings ------------------------------------------------------------


def test_quota_settings_defaults_and_overrides():
    default = load_settings({})
    assert (default.quota_fans, default.quota_channel_id, default.quota_hour_utc) == (5_000_000, None, 22)
    custom = load_settings({"QUOTA_FANS": "3000000", "QUOTA_CHANNEL_ID": "123456", "QUOTA_HOUR_UTC": "21"})
    assert (custom.quota_fans, custom.quota_channel_id, custom.quota_hour_utc) == (3_000_000, 123456, 21)


@pytest.mark.parametrize(
    "env", [{"QUOTA_CHANNEL_ID": "general"}, {"QUOTA_HOUR_UTC": "24"}, {"QUOTA_HOUR_UTC": "-1"}, {"QUOTA_FANS": "0"}]
)
def test_bad_quota_settings_are_refused(env):
    with pytest.raises(ConfigError):
        load_settings(env)
