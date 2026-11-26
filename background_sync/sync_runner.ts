import { SyncOutcome } from "../domain_models/types.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { SyncTooSoon } from "./sync_too_soon.js";

export class SyncRunner {
  private readonly service: TrackerService;
  private readonly intervalMs: number;
  private readonly minManualGapMs: number;
  private lastRunAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private runningPromise: Promise<SyncOutcome[]> | null = null;
  lastOutcomes: SyncOutcome[] = [];

  constructor(service: TrackerService, intervalSeconds: number, minManualGapSeconds = 30) {
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
    if (this.runningPromise) return this.runningPromise;
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
