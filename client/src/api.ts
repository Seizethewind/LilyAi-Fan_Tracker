import {
  ChatContextResponse,
  ChatTestRequest,
  ChatTestResponse,
  ClubHourlyResponse,
  HealthResponse,
  HourlyDay,
  LeaderboardResponse,
  MemberHourlyResponse,
  MemberResponse,
  OpenApiSpec,
  Period,
  StatusResponse,
  SyncResponse,
} from "./types";

// Keep user-entered API credentials strictly in JS memory rather than browser storage.
let inMemoryApiKey = "";

export class ClientApiError extends Error {
  status: number;
  code: string;
  retryAfterSeconds: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function getSavedApiKey(): string {
  return inMemoryApiKey;
}

export function saveApiKey(key: string): void {
  inMemoryApiKey = key.trim();
}

async function requestJson<T>(
  path: string,
  options: { method?: "GET" | "POST"; auth?: boolean; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.auth !== false) {
    const key = getSavedApiKey();
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const retryHeader = res.headers.get("Retry-After");
    const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : null;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body?.error) {
        throw new ClientApiError(
          res.status,
          body.error.code ?? "http_error",
          body.error.message ?? res.statusText,
          Number.isFinite(retryAfter) ? retryAfter : null
        );
      }
    } catch (err) {
      if (err instanceof ClientApiError) throw err;
    }
    throw new ClientApiError(
      res.status,
      "http_error",
      `HTTP ${res.status} ${res.statusText}`,
      Number.isFinite(retryAfter) ? retryAfter : null
    );
  }

  return (await res.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health", { auth: false });
}

export function fetchOpenApi(): Promise<OpenApiSpec> {
  return requestJson<OpenApiSpec>("/api/v1/openapi.json", { auth: false });
}

export function fetchStatus(): Promise<StatusResponse> {
  return requestJson<StatusResponse>("/api/v1/status");
}

export function fetchLeaderboard(
  club: string,
  period: Period,
  top: number
): Promise<LeaderboardResponse> {
  const qs = new URLSearchParams({ period, top: String(top) }).toString();
  return requestJson<LeaderboardResponse>(`/api/v1/clubs/${encodeURIComponent(club)}/leaderboard?${qs}`);
}

export function fetchClubHourly(club: string, day: HourlyDay): Promise<ClubHourlyResponse> {
  const qs = new URLSearchParams({ day }).toString();
  return requestJson<ClubHourlyResponse>(`/api/v1/clubs/${encodeURIComponent(club)}/hourly?${qs}`);
}

export function fetchMember(trainerId: string): Promise<MemberResponse> {
  return requestJson<MemberResponse>(`/api/v1/members/${encodeURIComponent(trainerId)}`);
}

export function fetchMemberHourly(
  trainerId: string,
  day: HourlyDay
): Promise<MemberHourlyResponse> {
  const qs = new URLSearchParams({ day }).toString();
  return requestJson<MemberHourlyResponse>(
    `/api/v1/members/${encodeURIComponent(trainerId)}/hourly?${qs}`
  );
}

export function triggerSync(): Promise<SyncResponse> {
  return requestJson<SyncResponse>("/api/v1/sync", { method: "POST" });
}

export function fetchChatContext(trainerId?: string): Promise<ChatContextResponse> {
  const qs = trainerId?.trim()
    ? `?${new URLSearchParams({ trainer_id: trainerId.trim() }).toString()}`
    : "";
  return requestJson<ChatContextResponse>(`/api/v1/chat/context${qs}`);
}

export function sendChatTest(payload: ChatTestRequest): Promise<ChatTestResponse> {
  return requestJson<ChatTestResponse>("/api/v1/chat", {
    method: "POST",
    body: payload,
  });
}
