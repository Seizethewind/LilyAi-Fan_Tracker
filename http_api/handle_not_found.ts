import { Request, Response } from "express";

export function handleNotFound(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "http_error", message: "Not Found" },
  });
}
