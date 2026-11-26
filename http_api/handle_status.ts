import { NextFunction, Request, Response } from "express";

import { VERSION } from "../domain_models/types.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { formatIso } from "../time_boundaries/format_iso.js";
import { utcNow } from "../time_boundaries/utc_now.js";
import { DiscordStatusPayload } from "./api_types.js";
import { formatClubStatus } from "./format_club_status.js";

export function handleStatus(
  service: TrackerService,
  discordStatus: () => DiscordStatusPayload
) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const infos = await service.clubInfos();
      res.json({
        server: "ok",
        version: VERSION,
        time: formatIso(utcNow()),
        discord: discordStatus(),
        clubs: infos.map(([club, info]) => formatClubStatus(club, info)),
      });
    } catch (err) {
      next(err);
    }
  };
}
