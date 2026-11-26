import { Settings } from "./config_types.js";

export function isAiEnabled(settings: Settings): boolean {
  const url = settings.aiRouterUrl;
  return Boolean(
    url &&
      settings.aiRouterApiKey &&
      (url.toLowerCase().startsWith("http://") || url.toLowerCase().startsWith("https://"))
  );
}
