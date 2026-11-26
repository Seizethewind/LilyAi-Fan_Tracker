export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly clock: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(limit: number, windowSeconds: number, clock: () => number = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowSeconds * 1000;
    this.clock = clock;
  }

  check(key: string): number {
    const now = this.clock();
    let list = this.hits.get(key);
    if (!list) {
      list = [];
      this.hits.set(key, list);
    }
    while (list.length > 0 && now - list[0] >= this.windowMs) {
      list.shift();
    }
    if (list.length >= this.limit) {
      const waitMs = Math.max(1, this.windowMs - (now - list[0]));
      return waitMs / 1000;
    }
    list.push(now);
    return 0;
  }
}
