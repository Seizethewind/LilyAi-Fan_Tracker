import { useEffect, useState } from "react";

import { fetchMember } from "../api_client/fetch_member";
import { MemberData } from "../api_client/frontend_types";
import { MemberSearchForm } from "./member_search_form";
import { MemberStandingsPanel } from "./member_standings_panel";

interface MemberSectionProps {
  initialTrainerId: string | null;
}

export function MemberSection({ initialTrainerId }: MemberSectionProps) {
  const [trainerQuery, setTrainerQuery] = useState(initialTrainerId ?? "");
  const [member, setMember] = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runLookup = async (targetId: string) => {
    const trimmed = targetId.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      setMember(await fetchMember(trimmed));
    } catch (err) {
      setMember(null);
      setError(err instanceof Error ? err.message : "Trainer lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTrainerId) {
      setTrainerQuery(initialTrainerId);
      void runLookup(initialTrainerId);
    }
  }, [initialTrainerId]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Trainer Standings Lookup
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Check daily, weekly, and monthly fan gains for any active club member.
        </p>
      </div>
      <MemberSearchForm
        trainerId={trainerQuery}
        onTrainerIdChange={setTrainerQuery}
        onSubmit={() => void runLookup(trainerQuery)}
        loading={loading}
      />
      <MemberStandingsPanel member={member} loading={loading} error={error} />
    </section>
  );
}
