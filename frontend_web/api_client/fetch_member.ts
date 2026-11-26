import { MemberData } from "./frontend_types";

export async function fetchMember(trainerId: string): Promise<MemberData> {
  const cleaned = trainerId.replace(/[\s-]/g, "");
  const res = await fetch(`/api/dashboard/members/${encodeURIComponent(cleaned)}`);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error?.message ?? "Trainer not found on any active roster.");
  }
  return payload as MemberData;
}
