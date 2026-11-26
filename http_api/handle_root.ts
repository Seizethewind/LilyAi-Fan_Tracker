import { Request, Response } from "express";

import { VERSION } from "../domain_models/types.js";

export function handleRoot(_req: Request, res: Response): void {
  res.json({
    name: "LilyAi Fan Tracker API",
    version: VERSION,
    health: "/health",
    docs: "/api/v1/docs",
    openapi: "/api/v1/openapi.json",
  });
}
