import crypto from "node:crypto";

export class ApiError extends Error {
  status: number;
  code: string;
  headers: Record<string, string>;

  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function matches(secret: string | null, candidate: string): boolean {
  if (!secret) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(candidate, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^(\S+)\s+(.+)$/);
  if (!match) return null;
  if (match[1].toLowerCase() !== "bearer") return null;
  const token = match[2].trim();
  return token.length > 0 ? token : null;
}

export type Role = "read" | "write";

export function authorize(
  readKey: string | null,
  writeKey: string | null,
  authorizationHeader: string | undefined,
  needWrite: boolean
): Role {
  if (!readKey && !writeKey) {
    throw new ApiError(503, "api_disabled", "The API has no keys configured on the server.");
  }
  const token = parseBearer(authorizationHeader);
  if (!token) {
    throw new ApiError(401, "unauthorized", "Missing or invalid API key.", {
      "WWW-Authenticate": "Bearer",
    });
  }
  const isWrite = matches(writeKey, token);
  const isRead = matches(readKey, token);
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

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly clock: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(limit: number, windowSeconds: number, clock: () => number = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowSeconds * 1000;
    this.clock = clock;
  }

  /**
   * Returns 0 if allowed (and recorded), otherwise seconds to wait (> 0).
   */
  check(key: string): number {
    const now = this.clock();
    let list = this.hits.get(key);
    if (!list) {
      list = [];
      this.hits.set(key, list);
    }
    while (list.length > 0 && now - list[0] >= this.windowMs) {
      list.shift();
    }
    if (list.length >= this.limit) {
      const waitMs = Math.max(1, this.windowMs - (now - list[0]));
      return waitMs / 1000;
    }
    list.push(now);
    return 0;
  }
}
