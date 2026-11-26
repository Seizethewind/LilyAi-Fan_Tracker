import { NextFunction, Request, Response } from "express";

import { buildTrackerContext } from "../ai_chat/build_tracker_summary.js";
import { ChatAssistant } from "../ai_chat/chat_assistant.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";

export function handleChatContext(
  assistant: ChatAssistant | null,
  service: TrackerService
) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await buildTrackerContext(service);
      res.json({
        ai_enabled: assistant !== null,
        context: { clubs: ctx.clubs },
      });
    } catch (err) {
      next(err);
    }
  };
}
