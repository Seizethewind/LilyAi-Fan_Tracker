import { NextFunction, Request, Response } from "express";

import { ApiError } from "../authentication/api_error.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { formatClubStatus } from "./format_club_status.js";

export function handleDashboardHourly(service: TrackerService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clubParam = typeof req.query.club === "string" ? req.query.club : "club1";
      const club = service.club(clubParam);
      if (!club) {
        throw new ApiError(404, "club_not_found", `Unknown club '${clubParam}'.`);
      }

      const dayParam = req.query.day === "yesterday" ? "yesterday" : "today";
      const [history, infos, clubInfo] = await Promise.all([
        service.hourlyClubHistory(club, dayParam),
        service.clubInfos(),
        service.store.clubInfo(club.clubId),
      ]);

      res.json({
        clubs: infos.map(([c, info]) => formatClubStatus(c, info)),
        club: formatClubStatus(club, clubInfo),
        day: dayParam,
        game_day: history.gameDay,
        started_at: history.startedAtIso,
        started_late: history.startedLate,
        total: history.total,
        rows: history.rows.map((r) => ({
          hour_iso: r.hourIso,
          label: r.label,
          this_hour: r.thisHour,
          since_reset: r.sinceReset,
          in_progress: r.inProgress,
          gap_hours: r.gapHours,
        })),
      });
    } catch (err) {
      next(err);
    }
  };
}
