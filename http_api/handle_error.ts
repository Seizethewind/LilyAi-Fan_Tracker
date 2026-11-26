import { NextFunction, Request, Response } from "express";

import { ApiError } from "../authentication/api_error.js";

export function handleError(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    for (const [k, v] of Object.entries(err.headers)) {
      res.setHeader(k, v);
    }
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(422).json({
      error: { code: "invalid_request", message: "Invalid JSON body." },
    });
    return;
  }

  console.error("Unhandled error in an API request", err);
  res.status(500).json({
    error: { code: "internal_error", message: "Internal server error." },
  });
}
