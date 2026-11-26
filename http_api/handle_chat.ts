import { NextFunction, Request, Response } from "express";

import { buildTrackerContext } from "../ai_chat/build_tracker_summary.js";
import { ChatAssistant } from "../ai_chat/chat_assistant.js";
import { ApiError } from "../authentication/api_error.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { RawMessageInput } from "../mention_parser/mention_types.js";

function parseMessageInput(raw: unknown, fieldName: string): RawMessageInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ApiError(422, "invalid_request", `body.${fieldName}: must be a JSON object`);
  }
  const obj = raw as Record<string, unknown>;
  const authorId =
    typeof obj.author_id === "string" && obj.author_id.trim() ? obj.author_id.trim() : null;
  if (!authorId) {
    throw new ApiError(422, "invalid_request", `body.${fieldName}.author_id: required string`);
  }
  return {
    content: typeof obj.content === "string" ? obj.content : "",
    authorId,
    authorName: typeof obj.author_name === "string" ? obj.author_name : undefined,
    channelId: typeof obj.channel_id === "string" ? obj.channel_id : undefined,
    mentions: Array.isArray(obj.mentions) ? obj.mentions : undefined,
    attachments: Array.isArray(obj.attachments) ? obj.attachments : undefined,
  };
}

export function handleChat(assistant: ChatAssistant | null, service: TrackerService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!assistant) {
        throw new ApiError(
          503,
          "ai_disabled",
          "AI chat is not configured on the server (set AI_ROUTER_URL and AI_ROUTER_API_KEY)."
        );
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const message = parseMessageInput(body.message, "message");
      const replied = body.replied != null ? parseMessageInput(body.replied, "replied") : null;
      const botId = typeof body.bot_id === "string" && body.bot_id.trim() ? body.bot_id.trim() : undefined;

      const { summaryText } = await buildTrackerContext(service);
      const reply = await assistant.handleMention(message, replied, botId, summaryText);
      res.json({
        status: reply.status,
        reply: reply.text,
        wait_seconds: reply.waitSeconds ?? null,
      });
    } catch (err) {
      next(err);
    }
  };
}
