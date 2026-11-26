import { NextFunction, Request, Response } from "express";

import { ApiError } from "../authentication/api_error.js";
import { authorizeRequest } from "../authentication/authorize_request.js";
import { RateLimiter } from "../authentication/rate_limiter.js";
import { Settings } from "../configuration/config_types.js";

export function requireAuthMiddleware(
  settings: Settings,
  limiter: RateLimiter,
  needWrite: boolean
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const role = authorizeRequest(
        settings.apiReadKey,
        settings.apiWriteKey,
        req.header("authorization"),
        needWrite
      );
      const wait = limiter.check(role);
      if (wait > 0) {
        throw new ApiError(429, "rate_limited", "Too many requests.", {
          "Retry-After": String(Math.ceil(wait)),
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
