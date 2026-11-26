import { SyncClubResult } from "./frontend_types";

export async function triggerSync(): Promise<SyncClubResult[]> {
  const res = await fetch("/api/dashboard/sync", { method: "POST" });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error?.message ?? "Sync could not be started.");
  }
  return (payload?.results ?? []) as SyncClubResult[];
}
