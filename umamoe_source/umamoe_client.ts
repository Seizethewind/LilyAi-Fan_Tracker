import { ClubSnapshot } from "../domain_models/types.js";
import { parseCircleResponse } from "./parse_circle_response.js";
import { FanSource, SourceError } from "./source_error.js";

const DEFAULT_BASE_URL = "https://uma.moe";
const CIRCLES_PATH = "/api/v4/circles";
const DEFAULT_TIMEOUT_MS = 15_000;
const CLUB_ID_RE = /^\d{1,20}$/;

export class UmaMoeClient implements FanSource {
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
        headers: { "X-API-Key": this.apiKey, Accept: "application/json" },
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
        if (body && typeof body.error === "string") detail = `: ${body.error.slice(0, 200)}`;
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
      return typeof circleId === "number" && Number.isInteger(circleId) ? String(circleId) : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not look up the circle of a trainer: ${message}`);
      return null;
    }
  }
}
