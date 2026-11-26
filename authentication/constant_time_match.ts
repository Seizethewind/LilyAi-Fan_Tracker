import crypto from "node:crypto";

export function constantTimeMatch(secret: string | null, candidate: string): boolean {
  if (!secret) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(candidate, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
