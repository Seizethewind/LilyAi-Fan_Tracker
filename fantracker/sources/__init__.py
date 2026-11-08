from fantracker.config import Settings
from fantracker.sources.base import FanSource, SourceError


def build_source(settings: Settings) -> FanSource:
    """Create the uma.moe client.

    NOT IMPLEMENTED YET. The endpoint paths, auth header and response fields
    must come from https://uma.moe/api/docs/openapi.yaml, which could not be
    read when this was written, and this project does not guess API details.
    See docs/UMAMOE.md for exactly what is needed.
    """
    raise SourceError(
        "The uma.moe client is not implemented yet: it is waiting on the OpenAPI spec. See docs/UMAMOE.md."
    )


__all__ = ["FanSource", "SourceError", "build_source"]
