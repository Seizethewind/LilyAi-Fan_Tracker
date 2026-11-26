import { RefreshCw } from "lucide-react";

import { ActiveView } from "../api_client/frontend_types";

interface TopBarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  onSync: () => void;
  syncing: boolean;
}

const NAV_ITEMS: ReadonlyArray<{ id: ActiveView; label: string }> = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "hourly", label: "Hourly" },
  { id: "member", label: "Member Lookup" },
  { id: "chat", label: "Mention Chat" },
];

export function TopBar({ activeView, onSelectView, onSync, syncing }: TopBarProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
        <a
          href="#leaderboard"
          onClick={(e) => {
            e.preventDefault();
            onSelectView("leaderboard");
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          LilyAi Fan Tracker
        </a>

        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-6 overflow-x-auto text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`min-h-10 cursor-pointer border-b-2 px-1 py-2 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  active
                    ? "border-blue-600 text-slate-900"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>{syncing ? "Syncing..." : "Sync Clubs"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
