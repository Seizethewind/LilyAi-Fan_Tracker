import { useState } from "react";

import { ActiveView } from "../api_client/frontend_types";
import { triggerSync } from "../api_client/trigger_sync";
import { HourlySection } from "../hourly_view/hourly_section";
import { LeaderboardSection } from "../leaderboard_view/leaderboard_section";
import { MemberSection } from "../member_lookup/member_section";
import { MentionChatSection } from "../mention_chat/mention_chat_section";
import { TopBar } from "../navigation_bar/top_bar";

export function DashboardApp() {
  const [activeView, setActiveView] = useState<ActiveView>("leaderboard");
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const results = await triggerSync();
      setSyncNotice(
        results
          .map((r) =>
            r.ok ? `${r.club}: ${r.member_count ?? 0} synced` : `${r.club}: ${r.error ?? "failed"}`
          )
          .join(" · ")
      );
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onSync={() => void handleSync()}
        syncing={syncing}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {syncNotice && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
            {syncNotice}
          </div>
        )}
        {activeView === "leaderboard" && (
          <LeaderboardSection
            refreshSignal={refreshSignal}
            onSelectTrainer={(id) => {
              setSelectedTrainerId(id);
              setActiveView("member");
            }}
            onSync={() => void handleSync()}
          />
        )}
        {activeView === "hourly" && (
          <HourlySection refreshSignal={refreshSignal} onSync={() => void handleSync()} />
        )}
        {activeView === "member" && <MemberSection initialTrainerId={selectedTrainerId} />}
        {activeView === "chat" && <MentionChatSection />}
      </main>
    </div>
  );
}
