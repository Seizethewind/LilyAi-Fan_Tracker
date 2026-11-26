import { Settings } from "../configuration/config_types.js";
import { isAiEnabled } from "../configuration/is_ai_enabled.js";
import { ChatAssistant } from "./chat_assistant.js";
import { RouterClient } from "./router_client.js";

export function buildAssistant(settings: Settings): ChatAssistant | null {
  if (!isAiEnabled(settings)) return null;
  const client = new RouterClient(
    settings.aiRouterUrl ?? "",
    settings.aiRouterApiKey ?? "",
    settings.aiModel
  );
  return new ChatAssistant(client, settings.aiUserCooldownSeconds);
}
