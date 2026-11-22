from fantracker.config import Settings
from fantracker.sources.base import FanSource, SourceError
from fantracker.sources.umamoe import UmaMoeSource


def build_source(settings: Settings) -> FanSource:
    """Create the uma.moe client. Raises SourceError if UMAMOE_API_KEY is not set."""
    return UmaMoeSource(settings.umamoe_api_key)


__all__ = ["FanSource", "SourceError", "build_source"]
