# uma.moe client

The uma.moe data source lives in `umamoe_source/umamoe_client.ts` (alongside `umamoe_source/parse_circle_response.ts` and `umamoe_source/source_error.ts`). It implements the `FanSource` interface in `fan_tracker/tracker_types.ts`, and `buildSource()` in `umamoe_source/build_source.ts` returns it.

Everything below comes from the OpenAPI spec at `https://uma.moe/api/docs/openapi.yaml`
(version 1.0.0, read on 2026-11-22). Nothing is guessed except the items under
"Assumptions".

## What it calls

| Item | Value from the spec |
| --- | --- |
| Request | `GET https://uma.moe/api/v4/circles?circle_id=<club id>` |
| Auth | `X-API-Key` header (from the `UMAMOE_API_KEY` environment variable only) |
| Club name | `circle.name` |
| Member list | `members[]`, no pagination parameters in the spec |
| Trainer ID | `members[].viewer_id` |
| Display name | `members[].trainer_name` (nullable; falls back to the trainer ID) |
| Fan total | `members[].daily_fans`, a 31-element array of cumulative daily fan totals |

`month` and `year` are left out, so uma.moe uses the current game month.

## Assumptions (not verified against the live service)

- The spec does not say which element of `daily_fans` is "today". The current total is the
  **last non-zero element**.
- The spec does not say whether `daily_fans` starts again at the beginning of a month.
  If it does, gains computed across a month change will look wrong.
- A member whose `daily_fans` is all zero has no fan total yet, so they are left out
  until one appears.
- If **no** member has a fan total (for example right after a month change), the sync
  fails with a clear error instead of reporting an empty roster, so the tracker keeps
  its last good data.

## Errors

Every failure is thrown as `SourceError` and ends up in the club's `last_error`. Messages
never contain the API key. HTTP 401 and 403 mention `UMAMOE_API_KEY`.

## Tests

The sync and command tests in `tests/discord_hourly.test.mjs` and `tests/ai_http.test.mjs`
use a **mocked** `FanSource`. They do not hit the live uma.moe service. To verify for real,
set `UMAMOE_API_KEY` and watch the first sync: `last_error` stays empty and the member
counts match uma.moe.

## Key hygiene

The key is read from `UMAMOE_API_KEY` only. An earlier key was shared in plain text in a
chat preference, so rotate it when convenient.
