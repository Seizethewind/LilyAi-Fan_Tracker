# Hourly fan gain history

`/fan_gain_history` shows a club's fan gain hour by hour, from the last daily reset
(15:00 UTC) up to now. The title shows the game day (the JST date); the time column is UTC.

```
Club 1 · Hourly fan gain · Wed 04 Nov
UTC     This hour  Since reset
16:00    +500,000     +500,000
17:00    +600,000   +1,100,000
17:40*   +150,000   +1,250,000
Total               +1,250,000
```

## Options

- **club**: Club 1, Club 2 or Both clubs. Shows the club's total.
- **user**: another Discord user. Shows that one trainer's own hourly gain, found through their
  linked trainer ID (`/link`), the same as `/fan_gain`.
- **neither**: shows your own hourly gain (you need to have used `/link`).
- **day**: `Today` (default) or `Yesterday`. Yesterday is the full 24 hours; its last line is
  stored at the reset and labelled `15:00`.

Pick a club **or** a user, not both.

## One trainer's view

```
Alice · Hourly fan gain · Wed 04 Nov
Club: Club 1
UTC     This hour  Since reset
16:00     +300,000     +300,000
17:00     +400,000     +700,000
17:40*     +50,000     +750,000
Total                  +750,000
```

It uses the same stored hourly totals, the same lines and the same rules, counting only that
trainer. The Total is the same number `/fan_gain` shows for the day, and the trainers' totals add up
to the club's. A trainer who joined during the day has no hourly gains until the next game day (the
command says so), and a trainer who has left has no history.

## What is stored

At every flat UTC hour the bot saves each member's fan total in `hour_snapshots`. The snapshot is
taken by the first successful sync in that hour, so a mark can be up to one sync interval
(5 minutes) late. Rows older than 8 days are deleted.

Only the **totals** are stored. Both columns are computed from them:

- **This hour**: this hour's total minus the previous stored hour's total, added up over members.
- **Since reset**: the running sum of the "This hour" lines. The **Total** is the last
  "Since reset", never a sum of that column, so nothing is counted twice.

Because of that, at any moment: last "Since reset" = sum of "This hour" = `/leaderboard daily`
summed over the club (when history covers the whole day). A test checks this.

## Rules

- **Only current members count.** Someone who left never appears, even for hours before they left.
- **Joiners count from the next game day**, the same as the daily gain. Only members already
  present at the first stored hour of the day are counted.
- **Moving between clubs keeps the hours.** Someone promoted from Club 2 to Club 1 counts in Club 1
  with the hours already stored under Club 2, so Club 1's total still matches the daily gain.
- **Missed hours are not invented.** If the bot was off for a while, the next stored hour carries
  the whole gap and is marked like `04:00 (3h)`.
- **The `*` line** is the hour still in progress, worked out from the latest sync when you run the
  command. It is not stored. It makes the total match the daily gain right now.
- **Tally resets**: if a member's total drops below the previous hour's (for example when uma.moe
  starts a new month), the new total is counted as that hour's gain, the same rule as elsewhere.
  Around a month change the hourly sum can therefore differ from the daily gain.
- **Not backfilled.** History starts when this feature is first deployed; the command says
  "Hourly tracking began at HH:MM UTC" when the first stored hour is after the reset.

## Limits

- Accuracy depends on how often uma.moe refreshes member fan totals. If it refreshes less than
  hourly, some hours show 0 followed by a larger jump. This has not been checked on live data.
- Tests use a fake data source and in-memory SQLite. They do not show how Turso or uma.moe behave.
