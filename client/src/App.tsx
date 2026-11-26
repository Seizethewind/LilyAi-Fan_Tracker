import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClientApiError,
  fetchStatus,
  getSavedApiKey,
  saveApiKey,
  triggerSync,
} from "./api";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ChatTestView } from "./components/ChatTestView";
import { HourlyView } from "./components/HourlyView";
import { LeaderboardView } from "./components/LeaderboardView";
import { Sidebar } from "./components/Sidebar";
import { StatusDocsView } from "./components/StatusDocsView";
import { TopBar } from "./components/TopBar";
import { TrainerView } from "./components/TrainerView";
import { ClubStatus, NavSection, SyncResponse } from "./types";

const SECTION_LABELS: Record<NavSection, string> = {
  leaderboards: "Leaderboards",
  hourly: "Hourly History",
  trainer: "Trainer Lookup",
  ai_chat: "AI Chat",
  status: "Sync & API",
};

export function App() {
  const [section, setSection] = useState<NavSection>("leaderboards");
  const [selectedClub, setSelectedClub] = useState<string>("club1");
  const [trainerLookupId, setTrainerLookupId] = useState<string>("");
  const [clubs, setClubs] = useState<ClubStatus[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [apiKey, setApiKey] = useState<string>(() => getSavedApiKey());
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyVersion, setApiKeyVersion] = useState(0);

  const [syncing, setSyncing] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResponse | null>(null);
  const [lastSyncError, setLastSyncError] = useState<ClientApiError | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    tone: "ok" | "warn" | "error";
    text: string;
  } | null>(null);

  const loadClubsMetadata = useCallback(async () => {
    try {
      const status = await fetchStatus();
      setClubs(status.clubs);
    } catch {
      // Handled gracefully by individual views
    }
  }, []);

  useEffect(() => {
    void loadClubsMetadata();
  }, [loadClubsMetadata, apiKeyVersion, syncVersion]);

  const handleSaveApiKey = (nextKey: string) => {
    saveApiKey(nextKey);
    setApiKey(nextKey);
    setApiKeyVersion((v) => v + 1);
    setBannerMessage(null);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setLastSyncError(null);
    setBannerMessage(null);
    try {
      const res = await triggerSync();
      setLastSyncResult(res);
      setSyncVersion((v) => v + 1);
      const okCount = res.results.filter((r) => r.ok).length;
      const failCount = res.results.length - okCount;
      if (failCount === 0) {
        setBannerMessage({
          tone: "ok",
          text: `Synced ${okCount} club${okCount === 1 ? "" : "s"} successfully.`,
        });
      } else {
        const firstErr = res.results.find((r) => !r.ok)?.error ?? "Check club status.";
        setBannerMessage({
          tone: "warn",
          text: `Sync finished with ${failCount} failure(s): ${firstErr}`,
        });
      }
    } catch (err) {
      if (err instanceof ClientApiError) {
        setLastSyncError(err);
        if (err.status === 401 || err.status === 403) {
          setBannerMessage({
            tone: "error",
            text: `${err.message} Enter a write-capable Bearer key to trigger sync.`,
          });
          setApiKeyModalOpen(true);
        } else if (err.status === 429) {
          setBannerMessage({
            tone: "warn",
            text: err.retryAfterSeconds
              ? `Sync cooldown active. Try again in ${err.retryAfterSeconds}s.`
              : err.message,
          });
        } else {
          setBannerMessage({
            tone: "error",
            text: `${err.code}: ${err.message}`,
          });
        }
      } else {
        setBannerMessage({ tone: "error", text: "Sync request failed." });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleInspectTrainer = (trainerId: string) => {
    setTrainerLookupId(trainerId);
    setSection("trainer");
  };

  const breadcrumbs = useMemo(() => {
    const base = ["LilyAi Tracker", SECTION_LABELS[section]];
    if (section === "leaderboards") {
      if (selectedClub === "both") {
        base.push("Both Clubs");
      } else {
        const club = clubs.find((c) => c.key === selectedClub);
        base.push(club?.label ?? (selectedClub === "club2" ? "Club 2" : "Club 1"));
      }
    } else if (section === "trainer" && trainerLookupId) {
      base.push(trainerLookupId);
    }
    return base;
  }, [section, selectedClub, clubs, trainerLookupId]);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={section}
        onSelect={setSection}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          breadcrumbs={breadcrumbs}
          hasApiKey={Boolean(apiKey)}
          syncing={syncing}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
          onSyncNow={() => void handleSyncNow()}
        />

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {bannerMessage && (
            <div
              className={`mb-5 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-xs ${
                bannerMessage.tone === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : bannerMessage.tone === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              <span>{bannerMessage.text}</span>
              <button
                type="button"
                onClick={() => setBannerMessage(null)}
                className="font-medium underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {section === "leaderboards" && (
            <LeaderboardView
              clubs={clubs}
              selectedClub={selectedClub}
              onSelectClub={setSelectedClub}
              apiKeyVersion={apiKeyVersion}
              syncVersion={syncVersion}
              onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
              onSyncNow={() => void handleSyncNow()}
              onInspectTrainer={handleInspectTrainer}
            />
          )}

          {section === "hourly" && (
            <HourlyView
              clubs={clubs}
              apiKeyVersion={apiKeyVersion}
              syncVersion={syncVersion}
              onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
            />
          )}

          {section === "trainer" && (
            <TrainerView
              initialTrainerId={trainerLookupId}
              apiKeyVersion={apiKeyVersion}
              syncVersion={syncVersion}
              onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
            />
          )}

          {section === "ai_chat" && (
            <ChatTestView
              apiKeyVersion={apiKeyVersion}
              syncVersion={syncVersion}
              onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
            />
          )}

          {section === "status" && (
            <StatusDocsView
              apiKeyVersion={apiKeyVersion}
              syncVersion={syncVersion}
              lastSyncResult={lastSyncResult}
              lastSyncError={lastSyncError}
              onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
              onSyncNow={() => void handleSyncNow()}
            />
          )}
        </main>
      </div>

      <ApiKeyModal
        open={apiKeyModalOpen}
        currentKey={apiKey}
        onSave={handleSaveApiKey}
        onClose={() => setApiKeyModalOpen(false)}
      />
    </div>
  );
}
