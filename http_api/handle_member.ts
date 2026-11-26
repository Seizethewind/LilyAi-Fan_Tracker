import { NextFunction, Request, Response } from "express";

import { ApiError } from "../authentication/api_error.js";
import { PERIODS } from "../domain_models/types.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { formatClubStatus } from "./format_club_status.js";

export function handleMember(service: TrackerService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawTrainerId = req.params.trainer_id;
      const trainerId = Array.isArray(rawTrainerId) ? rawTrainerId[0] ?? "" : rawTrainerId;
      const standings = await service.allStandingsForTrainer(trainerId);
      const first = PERIODS.map((p) => standings[p]).find((s) => s !== undefined);
      if (!first) {
        throw new ApiError(
          404,
          "member_not_found",
          "That trainer is not on a club roster right now."
        );
      }

      const periodsJson: Record<string, { gain: number; rank: number; has_baseline: boolean }> = {};
      for (const p of PERIODS) {
        const s = standings[p];
        if (s) {
          periodsJson[p] = {
            gain: s.row.gain,
            rank: s.row.rank,
            has_baseline: s.row.hasBaseline,
          };
        }
      }

      res.json({
        trainer_id: first.row.trainerId,
        name: first.row.name,
        fans: first.row.fans,
        club: formatClubStatus(first.club, first.info),
        roster_size: first.rosterSize,
        periods: periodsJson,
      });
    } catch (err) {
      next(err);
    }
  };
}
