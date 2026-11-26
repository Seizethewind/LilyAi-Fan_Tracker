import { Request, Response } from "express";

import { VERSION } from "../domain_models/types.js";

export function handleHealth(_req: Request, res: Response): void {
  res.json({ status: "ok", version: VERSION });
}
