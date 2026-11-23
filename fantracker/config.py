"""Settings, read once from environment variables.

No secret has a default. Club IDs are not secret, so the two clubs this
project was built for are the defaults.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

DEFAULT_CLUB1_ID = "974470619"
DEFAULT_CLUB2_ID = "325938032"


class ConfigError(RuntimeError):
    """The environment cannot produce a usable configuration."""


@dataclass(frozen=True)
class ClubConfig:
    key: str  # stable name used by slash commands and the API: "club1" / "club2"
    club_id: str  # uma.moe circle id
    label: str  # display name until the data source supplies the real one


@dataclass(frozen=True)
class Settings:
    clubs: tuple[ClubConfig, ...]
    discord_token: str | None
    discord_guild_id: int | None
    turso_url: str | None
    turso_token: str | None
    sqlite_path: str
    umamoe_api_key: str | None
    sync_interval_seconds: int
    self_ping_url: str | None
    self_ping_interval_seconds: int
    api_read_key: str | None
    api_write_key: str | None
    cors_origins: tuple[str, ...]
    port: int
    on_render: bool
    # AI replies to @mentions, through the self-hosted router (OpenAI-compatible).
    ai_router_url: str | None = None  # should end in /v1
    ai_router_api_key: str | None = None
    ai_model: str = "auto"
    ai_user_cooldown_seconds: int = 10
    # Daily fan quota warning: posted once a day at quota_hour_utc when quota_channel_id is set.
    quota_fans: int = 5_000_000
    quota_channel_id: int | None = None
    quota_hour_utc: int = 22  # 22:00 UTC is 6:00 AM in the Philippines


def ai_enabled(settings: Settings) -> bool:
    """AI replies need both a router URL (http/https) and a key."""
    url = settings.ai_router_url
    return bool(url and settings.ai_router_api_key and url.lower().startswith(("http://", "https://")))


def _opt(env: Mapping[str, str], name: str) -> str | None:
    value = env.get(name)
    value = value.strip() if value else ""
    return value or None


def _int(env: Mapping[str, str], name: str, default: int, *, minimum: int) -> int:
    raw = _opt(env, name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer") from exc
    if value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}")
    return value


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env

    clubs = (
        ClubConfig("club1", _opt(env, "CLUB1_ID") or DEFAULT_CLUB1_ID, _opt(env, "CLUB1_LABEL") or "Club 1"),
        ClubConfig("club2", _opt(env, "CLUB2_ID") or DEFAULT_CLUB2_ID, _opt(env, "CLUB2_LABEL") or "Club 2"),
    )
    if clubs[0].club_id == clubs[1].club_id:
        raise ConfigError("CLUB1_ID and CLUB2_ID must be different")

    guild_raw = _opt(env, "DISCORD_GUILD_ID")
    if guild_raw is not None and not guild_raw.isdigit():
        raise ConfigError("DISCORD_GUILD_ID must be a numeric Discord server id")

    channel_raw = _opt(env, "QUOTA_CHANNEL_ID")
    if channel_raw is not None and not channel_raw.isdigit():
        raise ConfigError("QUOTA_CHANNEL_ID must be a numeric Discord channel id")
    quota_hour = _int(env, "QUOTA_HOUR_UTC", 22, minimum=0)
    if quota_hour > 23:
        raise ConfigError("QUOTA_HOUR_UTC must be between 0 and 23")

    ping_url = _opt(env, "SELF_PING_URL")
    if ping_url is None:
        external = _opt(env, "RENDER_EXTERNAL_URL")  # set automatically by Render
        if external:
            ping_url = external.rstrip("/") + "/health"

    cors = _opt(env, "CORS_ORIGINS") or ""

    return Settings(
        clubs=clubs,
        discord_token=_opt(env, "DISCORD_TOKEN"),
        discord_guild_id=int(guild_raw) if guild_raw else None,
        turso_url=_opt(env, "TURSO_DATABASE_URL"),
        turso_token=_opt(env, "TURSO_AUTH_TOKEN"),
        sqlite_path=_opt(env, "SQLITE_PATH") or "fantracker.db",
        umamoe_api_key=_opt(env, "UMAMOE_API_KEY"),
        # 60s floor protects uma.moe from an accidental tight loop.
        sync_interval_seconds=_int(env, "SYNC_INTERVAL_SECONDS", 300, minimum=60),
        self_ping_url=ping_url,
        self_ping_interval_seconds=_int(env, "SELF_PING_INTERVAL_SECONDS", 300, minimum=30),
        api_read_key=_opt(env, "API_READ_KEY"),
        api_write_key=_opt(env, "API_WRITE_KEY"),
        cors_origins=tuple(o.strip() for o in cors.split(",") if o.strip()),
        port=_int(env, "PORT", 8000, minimum=1),
        on_render=_opt(env, "RENDER") is not None,
        ai_router_url=(_opt(env, "AI_ROUTER_URL") or "").rstrip("/") or None,
        ai_router_api_key=_opt(env, "AI_ROUTER_API_KEY"),
        ai_model=_opt(env, "AI_MODEL") or "auto",
        ai_user_cooldown_seconds=_int(env, "AI_USER_COOLDOWN_SECONDS", 10, minimum=0),
        quota_fans=_int(env, "QUOTA_FANS", 5_000_000, minimum=1),
        quota_channel_id=int(channel_raw) if channel_raw else None,
        quota_hour_utc=quota_hour,
    )


def validate_for_runtime(settings: Settings) -> list[str]:
    """Raise ConfigError for fatal problems; return warnings for the rest."""
    if bool(settings.turso_url) != bool(settings.turso_token):
        raise ConfigError("Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, or neither")
    if settings.on_render and not settings.turso_url:
        raise ConfigError(
            "Render's filesystem is wiped on every restart, so a local SQLite file would "
            "lose all data. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN."
        )

    warnings: list[str] = []
    if not settings.discord_token:
        warnings.append("DISCORD_TOKEN is not set: the Discord bot will not start.")
    if not (settings.api_read_key or settings.api_write_key):
        warnings.append("API_READ_KEY / API_WRITE_KEY are not set: private API endpoints will answer 503.")
    if not settings.umamoe_api_key:
        warnings.append("UMAMOE_API_KEY is not set.")
    if settings.quota_channel_id and not settings.discord_token:
        warnings.append("QUOTA_CHANNEL_ID is set but DISCORD_TOKEN is not: no quota warning will be posted.")
    # AI replies are optional, so nothing is said when neither value is set. A placeholder
    # or half-set value only turns the feature off; it never stops the app.
    if bool(settings.ai_router_url) != bool(settings.ai_router_api_key):
        warnings.append("Set both AI_ROUTER_URL and AI_ROUTER_API_KEY to turn on AI replies to @mentions.")
    elif settings.ai_router_url and not ai_enabled(settings):
        warnings.append("AI_ROUTER_URL must start with http:// or https://: AI replies are off.")
    return warnings
