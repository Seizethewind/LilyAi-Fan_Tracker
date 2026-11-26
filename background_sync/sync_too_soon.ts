export class SyncTooSoon extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("a sync ran very recently");
    this.name = "SyncTooSoon";
    this.retryAfter = retryAfter;
  }
}
