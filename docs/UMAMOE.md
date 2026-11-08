# uma.moe client: what is still needed

The uma.moe data source is **not implemented yet**. `fantracker/sources/__init__.py`
raises a clear error from `build_source()`, and the app reports it in each club's
`last_error` instead of crashing. Everything else (storage, gain rules, commands,
API, self-ping) is built and tested against a fake source.

## Why

The spec at `https://uma.moe/api/docs/openapi.yaml` could not be fetched from the
build environment (the URL was not on its network allowlist), and the project rule is
to never invent endpoints, parameters, auth or response fields.

## What to provide

Attach the OpenAPI file, or paste these parts of it:

1. The endpoint that returns a circle (club) with its members, and its path parameters.
2. The authentication scheme: header name and format for the API key.
3. The member fields: trainer ID, display name, and the fan total, with their exact names and types.
4. Whether the member list is paginated.
5. Whether a daily fan history is available. If so, gains can come from it directly instead of from our own day snapshots.

## What will be written

One module, `fantracker/sources/umamoe.py`, implementing the `FanSource` protocol in
`fantracker/sources/base.py`:

```python
def fetch_club(self, club_id: str) -> ClubSnapshot: ...
```

plus a parser test using a response fixture copied from the spec. Nothing else changes:
`build_source()` returns the new client and the rest of the app already uses it.

## Keep the key out of the repo

The key is read from the `UMAMOE_API_KEY` environment variable only. It was shared in
plain text in a chat preference, so rotate it when convenient.
