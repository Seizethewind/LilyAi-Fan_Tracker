"""Entry point: one process runs the web API, the Discord bot and both background loops.

Render only keeps a web service running if it listens on a port, which is why
the bot and the HTTP server share a process:

    uvicorn fantracker.main:app --host 0.0.0.0 --port $PORT
"""

import asyncio
import contextlib
import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import timedelta

import uvicorn
from fastapi import FastAPI

from fantracker.api import create_app
from fantracker.config import ConfigError, load_settings, validate_for_runtime
from fantracker.quota import build_quota_posts
from fantracker.runner import SyncRunner, SyncTooSoon, run_quota_warning, run_self_ping
from fantracker.services.tracker import TrackerService
from fantracker.sources import SourceError, build_source
from fantracker.storage import SqliteDatabase, Store, TursoDatabase

logger = logging.getLogger("fantracker")


def configure_logging() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # httpx/urllib3 style loggers can print full URLs; keep them quiet.
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def build_app() -> FastAPI:
    configure_logging()
    try:
        settings = load_settings()
        for warning in validate_for_runtime(settings):
            logger.warning(warning)
    except ConfigError as exc:
        logger.critical("Configuration error: %s", exc)
        raise SystemExit(1) from None

    if settings.turso_url:
        db = TursoDatabase(settings.turso_url, settings.turso_token or "")
        logger.info("Storage: Turso")
    else:
        db = SqliteDatabase(settings.sqlite_path)
        logger.info("Storage: local SQLite file (%s). Not suitable for Render.", settings.sqlite_path)
    store = Store(db)
    store.init_schema()

    try:
        source = build_source(settings)
    except SourceError as exc:
        # Keep the API and bot up so Render stays healthy; syncs will report this error.
        reason = str(exc)  # `exc` is unbound once this except block ends
        logger.error("%s", reason)

        class _Unavailable:
            def fetch_club(self, club_id: str):
                raise SourceError(reason)

        source = _Unavailable()

    service = TrackerService(store, source, settings.clubs)
    sync_runner = SyncRunner(service, settings.sync_interval_seconds)

    discord_runner = None
    if settings.discord_token:
        from fantracker.discord_bot import DiscordRunner  # imported here so the API runs without discord.py

        discord_runner = DiscordRunner(settings.discord_token, service, settings)

    def discord_status() -> dict:
        if discord_runner is None:
            return {"state": "disabled", "latency_ms": None, "error": None}
        return discord_runner.status()

    async def refresh_before_quota() -> None:
        with contextlib.suppress(SyncTooSoon):  # data from the last few seconds is fresh enough
            await sync_runner.sync_now()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        stop = asyncio.Event()
        tasks = [asyncio.create_task(sync_runner.run(stop), name="sync")]
        if settings.self_ping_url:
            logger.info("Self-ping every %ss", settings.self_ping_interval_seconds)
            tasks.append(
                asyncio.create_task(
                    run_self_ping(settings.self_ping_url, settings.self_ping_interval_seconds, stop), name="self-ping"
                )
            )
        else:
            logger.info("Self-ping is off (no RENDER_EXTERNAL_URL or SELF_PING_URL).")
        if discord_runner is not None:
            tasks.append(asyncio.create_task(discord_runner.run(), name="discord"))
        if discord_runner is not None and settings.quota_channel_id:
            runner, channel_id = discord_runner, settings.quota_channel_id
            max_age = timedelta(seconds=settings.sync_interval_seconds * 2 + 60)
            logger.info("Quota warning: %s fans, daily at %02d:00 UTC", settings.quota_fans, settings.quota_hour_utc)
            tasks.append(
                asyncio.create_task(
                    run_quota_warning(
                        lambda: build_quota_posts(service, runner.assistant, settings.quota_fans, max_age),
                        lambda texts: runner.post(channel_id, texts),
                        settings.quota_hour_utc,
                        stop,
                        refresh=refresh_before_quota,
                    ),
                    name="quota",
                )
            )
        try:
            yield
        finally:
            stop.set()
            if discord_runner is not None:
                await discord_runner.close()
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            db.close()

    app = create_app(
        settings=settings, service=service, sync_runner=sync_runner, discord_status=discord_status
    )
    app.router.lifespan_context = lifespan
    return app


app = build_app()


if __name__ == "__main__":  # local run: python -m fantracker.main
    with contextlib.suppress(KeyboardInterrupt):
        uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
    sys.exit(0)
