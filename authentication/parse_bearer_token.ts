export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^(\S+)\s+(.+)$/);
  if (!match) return null;
  if (match[1].toLowerCase() !== "bearer") return null;
  const token = match[2].trim();
  return token.length > 0 ? token : null;
}
