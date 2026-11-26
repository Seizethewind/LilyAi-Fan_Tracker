import { NextFunction, Request, Response } from "express";

import { ApiError } from "../authentication/api_error.js";
import { PERIODS, Period } from "../domain_models/types.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { MAX_TOP } from "../fan_tracker/tracker_types.js";
import { formatIso } from "../time_boundaries/format_iso.js";
import { formatClubStatus } from "./format_club_status.js";

export function handleDashboardLeaderboard(service: TrackerService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clubParam = typeof req.query.club === "string" ? req.query.club : "club1";
      const club = service.club(clubParam);
      if (!club) {
        throw new ApiError(404, "club_not_found", `Unknown club '${clubParam}'.`);
      }

      const rawPeriod = typeof req.query.period === "string" ? req.query.period : "daily";
      if (!PERIODS.includes(rawPeriod as Period)) {
        throw new ApiError(422, "invalid_request", "Invalid period.");
      }
      const period = rawPeriod as Period;

      let top = MAX_TOP;
      if (req.query.top !== undefined) {
        const parsed = Number.parseInt(String(req.query.top), 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TOP) {
          throw new ApiError(422, "invalid_request", `top must be between 1 and ${MAX_TOP}`);
        }
        top = parsed;
      }

      const [board, infos] = await Promise.all([
        service.leaderboard(club, period, top),
        service.clubInfos(),
      ]);
      res.json({
        clubs: infos.map(([c, info]) => formatClubStatus(c, info)),
        club: formatClubStatus(club, board.info),
        period,
        top: board.top,
        resets_at: formatIso(board.resetsAt),
        entries: board.rows.map((r) => ({
          rank: r.rank,
          trainer_id: r.trainerId,
          name: r.name,
          fans: r.fans,
          gain: r.gain,
          has_baseline: r.hasBaseline,
        })),
      });
    } catch (err) {
      next(err);
    }
  };
}
