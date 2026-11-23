"""The daily fan quota warning: who is under it, and the messages that say so.

The router only writes the opening lines. The names and numbers come from the saved data, so the
warning stays correct, and still goes out in plain wording, when the router is down.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fantracker.formatting import discord_ts, format_int, leaderboard_table
from fantracker.llm import AiAssistant, format_wait
from fantracker.services.tracker import TrackerService

logger = logging.getLogger(__name__)


def fallback_intro(quota: int) -> str:
    return f"⚠️ Daily fan quota reminder: these members are still under {format_int(quota)} fans today."


def build_quota_posts(
    service: TrackerService, assistant: AiAssistant | None, quota: int, max_age: timedelta
) -> list[str]:
    """Discord messages to post, or an empty list when there is nobody to warn.

    Blocking (it may call the router): run it in a worker thread.
    """
    report = service.quota_report(quota, max_age)
    for club in report.stale:
        logger.warning("Quota check skipped %s: its data is too old to judge anyone by", club.key)
    if not report.shortfalls:
        logger.info("Quota check: nobody is under %s fans", format_int(quota))
        return []

    count = sum(len(s.rows) for s in report.shortfalls)
    wait = format_wait((report.resets_at - report.now).total_seconds())
    intro = (assistant.quota_intro(quota, count, wait) if assistant else None) or fallback_intro(quota)
    posts = [f"{intro}\nResets {discord_ts(report.resets_at)} (00:00 UTC)"]
    for s in report.shortfalls:
        posts.append(f"**{s.club.label}**: {len(s.rows)} under {format_int(quota)}\n{leaderboard_table(s.rows)}")
    return posts
