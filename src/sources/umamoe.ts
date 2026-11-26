import { Settings } from "../config.js";
import { ClubSnapshot, SourceMember } from "../models.js";
import { formatYmd } from "../timeutil.js";

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export interface FanSource {
  fetchClub(clubId: string): Promise<ClubSnapshot>;
  currentClub?(trainerId: string): Promise<string | null>;
}

const DEFAULT_BASE_URL = "https://uma.moe";
const CIRCLES_PATH = "/api/v4/circles";
const DEFAULT_TIMEOUT_MS = 15_000;
const CLUB_ID_RE = /^\d{1,20}$/;

function isSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function currentFans(dailyFans: unknown): number | null {
  if (!Array.isArray(dailyFans)) return null;
  let latest: number | null = null;
  for (const value of dailyFans) {
    if (isSafeInt(value) && value > 0) {
      latest = value;
    }
  }
  return latest;
}

export function monthHistory(row: Record<string, unknown>): Array<readonly [string, number]> {
  const values = row.daily_fans;
  const year = row.year;
  const month = row.month;
  if (!Array.isArray(values) || !isSafeInt(year) || !isSafeInt(month) || month < 1 || month > 12) {
    return [];
  }

  const known: Array<readonly [number, number]> = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (isSafeInt(v) && v !== 0) {
      known.push([i, Math.abs(v)]);
    }
  }

  if (known.length <= 1) return [];
  const out: Array<readonly [string, number]> = [];
  for (const [i, v] of known.slice(0, -1)) {
    const dt = new Date(Date.UTC(year, month - 1, 1 + i + 1));
    out.push([formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()), v]);
  }
  return out;
}

export function parseCircleResponse(payload: unknown, clubId: string): ClubSnapshot {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new SourceError("uma.moe returned an unexpected response (not a JSON object)");
  }
  const obj = payload as Record<string, unknown>;
  const circle = obj.circle;
  const rows = obj.members;

  if (
    typeof circle !== "object" ||
    circle === null ||
    Array.isArray(circle) ||
    !Array.isArray(rows)
  ) {
    throw new SourceError("uma.moe response is missing 'circle' or 'members'");
  }

  const circleObj = circle as Record<string, unknown>;
  if (String(circleObj.circle_id) !== clubId) {
    throw new SourceError(`uma.moe returned circle ${String(circleObj.circle_id)} instead of ${clubId}`);
  }

  const members: SourceMember[] = [];
  const seen = new Set<string>();

  for (const rawRow of rows) {
    if (typeof rawRow !== "object" || rawRow === null || Array.isArray(rawRow)) {
      throw new SourceError("uma.moe member row has no numeric viewer_id");
    }
    const row = rawRow as Record<string, unknown>;
    if (!isSafeInt(row.viewer_id)) {
      throw new SourceError("uma.moe member row has no numeric viewer_id");
    }
    const trainerId = String(row.viewer_id);
    if (seen.has(trainerId)) {
      throw new SourceError(`uma.moe listed trainer ${trainerId} twice`);
    }
    seen.add(trainerId);

    const fans = currentFans(row.daily_fans);
    if (fans === null) {
      continue;
    }

    const rawName = row.trainer_name;
    const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : trainerId;
    const stamp = row.last_updated;
    const updated = typeof stamp === "string" ? stamp : null;

    members.push({
      trainerId,
      name,
      fans,
      updated,
      history: monthHistory(row),
    });
  }

  if (members.length === 0) {
    throw new SourceError("uma.moe has no fan totals for any member yet (new month?)");
  }

  const clubName =
    typeof circleObj.name === "string" && circleObj.name.trim() ? circleObj.name.trim() : null;

  return {
    clubId,
    members,
    clubName,
  };
}

export class UmaMoeSource implements FanSource {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(apiKey: string | null, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!apiKey) {
      throw new SourceError("UMAMOE_API_KEY is not set");
    }
    this.apiKey = apiKey;
    this.url = `${baseUrl.replace(/\/+$/, "")}${CIRCLES_PATH}`;
    this.timeoutMs = timeoutMs;
  }

  private async getJson(params: Record<string, string>): Promise<unknown> {
    const query = new URLSearchParams(params).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.url}?${query}`, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (err) {
      const errName = err instanceof Error ? err.name : "Error";
      throw new SourceError(`uma.moe request failed (${errName})`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status !== 200) {
      let detail = "";
      try {
        const body = (await response.json()) as Record<string, unknown>;
        if (body && typeof body.error === "string") {
          detail = `: ${body.error.slice(0, 200)}`;
        }
      } catch {
        // ignore invalid JSON error body
      }
      const hint = response.status === 401 || response.status === 403 ? " (check UMAMOE_API_KEY)" : "";
      throw new SourceError(`uma.moe answered HTTP ${response.status}${detail}${hint}`);
    }

    try {
      return await response.json();
    } catch {
      throw new SourceError("uma.moe returned invalid JSON");
    }
  }

  async fetchClub(clubId: string): Promise<ClubSnapshot> {
    const normalized = String(clubId).trim();
    if (!CLUB_ID_RE.test(normalized)) {
      throw new SourceError("club id must be numeric");
    }
    const payload = await this.getJson({ circle_id: normalized });
    return parseCircleResponse(payload, normalized);
  }

  async currentClub(trainerId: string): Promise<string | null> {
    const normalized = String(trainerId).trim();
    if (!CLUB_ID_RE.test(normalized)) return null;
    try {
      const payload = (await this.getJson({ viewer_id: normalized })) as Record<string, unknown>;
      const circle = payload?.circle as Record<string, unknown> | undefined;
      const circleId = circle?.circle_id;
      return isSafeInt(circleId) ? String(circleId) : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not look up the circle of a trainer: ${message}`);
      return null;
    }
  }
}

export function buildSource(settings: Settings): FanSource {
  return new UmaMoeSource(settings.umamoeApiKey);
}
