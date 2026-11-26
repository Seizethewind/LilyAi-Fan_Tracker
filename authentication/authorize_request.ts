import { ApiError } from "./api_error.js";
import { constantTimeMatch } from "./constant_time_match.js";
import { parseBearerToken } from "./parse_bearer_token.js";

export type Role = "read" | "write";

export function authorizeRequest(
  readKey: string | null,
  writeKey: string | null,
  authorizationHeader: string | undefined,
  needWrite: boolean
): Role {
  if (!readKey && !writeKey) {
    throw new ApiError(503, "api_disabled", "The API has no keys configured on the server.");
  }
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    throw new ApiError(401, "unauthorized", "Missing or invalid API key.", {
      "WWW-Authenticate": "Bearer",
    });
  }
  const isWrite = constantTimeMatch(writeKey, token);
  const isRead = constantTimeMatch(readKey, token);
  if (!isWrite && !isRead) {
    throw new ApiError(401, "unauthorized", "Missing or invalid API key.", {
      "WWW-Authenticate": "Bearer",
    });
  }
  if (needWrite && !isWrite) {
    throw new ApiError(403, "forbidden", "This key can read data but not change it.");
  }
  return isWrite ? "write" : "read";
}
