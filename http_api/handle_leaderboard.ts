import { NextFunction, Request, Response } from "express";

import { ApiError } from "../authentication/api_error.js";
import { PERIODS, Period } from "../domain_models/types.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { MAX_TOP } from "../fan_tracker/tracker_types.js";
import { formatIso } from "../time_boundaries/format_iso.js";
import { formatClubStatus } from "./format_club_status.js";

export function handleLeaderboard(service: TrackerService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawClubParam = req.params.club;
      const clubParam = Array.isArray(rawClubParam) ? rawClubParam[0] ?? "" : rawClubParam;
      const club = service.club(clubParam);
      if (!club) {
        throw new ApiError(
          404,
          "club_not_found",
          `Unknown club '${clubParam}'. Use club1, club2 or a configured club id.`
        );
      }

      const rawPeriod = typeof req.query.period === "string" ? req.query.period : "daily";
      if (!PERIODS.includes(rawPeriod as Period)) {
        throw new ApiError(
          422,
          "invalid_request",
          "query.period: Input should be 'daily', 'weekly' or 'monthly'"
        );
      }
      const period = rawPeriod as Period;

      let top = MAX_TOP;
      if (req.query.top !== undefined) {
        const rawTop = String(req.query.top);
        if (!/^-?\d+$/.test(rawTop)) {
          throw new ApiError(422, "invalid_request", "query.top: Input should be a valid integer");
        }
        top = Number.parseInt(rawTop, 10);
        if (top < 1 || top > MAX_TOP) {
          throw new ApiError(422, "invalid_request", `query.top: Input should be between 1 and ${MAX_TOP}`);
        }
      }

      const board = await service.leaderboard(club, period, top);
      res.json({
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
