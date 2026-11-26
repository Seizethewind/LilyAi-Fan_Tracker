import { NextFunction, Request, Response } from "express";

import { ApiError } from "../authentication/api_error.js";
import { SyncRunner } from "../background_sync/sync_runner.js";
import { SyncTooSoon } from "../background_sync/sync_too_soon.js";

export function handleSync(syncRunner: SyncRunner) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const outcomes = await syncRunner.syncNow();
      res.json({
        results: outcomes.map((o) => ({
          club: o.clubKey,
          ok: o.ok,
          member_count: o.result ? o.result.memberCount : null,
          error: o.error,
        })),
      });
    } catch (err) {
      if (err instanceof SyncTooSoon) {
        next(
          new ApiError(
            429,
            "rate_limited",
            "A sync ran moments ago; try again shortly.",
            { "Retry-After": String(Math.ceil(err.retryAfter)) }
          )
        );
        return;
      }
      next(err);
    }
  };
}
