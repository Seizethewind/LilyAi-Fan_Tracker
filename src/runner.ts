import { SyncOutcome } from "./models.js";
import { TrackerService } from "./services/tracker.js";

export class SyncTooSoon extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("a sync ran very recently");
    this.name = "SyncTooSoon";
    this.retryAfter = retryAfter;
  }
}

export class SyncRunner {
  private readonly service: TrackerService;
  private readonly intervalMs: number;
  private readonly minManualGapMs: number;
  private lastRunAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private runningPromise: Promise<SyncOutcome[]> | null = null;
  lastOutcomes: SyncOutcome[] = [];

  constructor(
    service: TrackerService,
    intervalSeconds: number,
    minManualGapSeconds = 30
  ) {
    this.service = service;
    this.intervalMs = intervalSeconds * 1000;
    this.minManualGapMs = minManualGapSeconds * 1000;
  }

  start(): void {
    if (this.timer) return;
    void this.cycle();
    this.timer = setInterval(() => {
      void this.cycle();
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncNow(): Promise<SyncOutcome[]> {
    if (this.lastRunAt !== null) {
      const elapsed = Date.now() - this.lastRunAt;
      if (elapsed < this.minManualGapMs) {
        throw new SyncTooSoon((this.minManualGapMs - elapsed) / 1000);
      }
    }
    return this.cycle();
  }

  private async cycle(): Promise<SyncOutcome[]> {
    if (this.runningPromise) {
      return this.runningPromise;
    }
    this.runningPromise = this.service
      .syncAll()
      .then((outcomes) => {
        this.lastRunAt = Date.now();
        this.lastOutcomes = outcomes;
        return outcomes;
      })
      .finally(() => {
        this.runningPromise = null;
      });
    return this.runningPromise;
  }
}

export function startSelfPing(url: string, intervalSeconds: number): () => void {
  let reportedOk = false;
  const timer = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "lilyai-fan-tracker-self-ping" },
          signal: controller.signal,
        });
        if (res.status >= 400) {
          console.warn(`Self-ping got HTTP ${res.status}`);
        } else if (!reportedOk) {
          console.info(`Self-ping is working (HTTP ${res.status})`);
          reportedOk = true;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      console.warn(`Self-ping failed (${name})`);
    }
  }, intervalSeconds * 1000);
  timer.unref();

  return () => clearInterval(timer);
}
