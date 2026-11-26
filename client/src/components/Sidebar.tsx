import { BarChart3, Clock, MessageSquare, Search, Server, X } from "lucide-react";
import { NavSection } from "../types";

interface SidebarProps {
  activeSection: NavSection;
  onSelect: (section: NavSection) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof BarChart3 }> = [
  { id: "leaderboards", label: "Leaderboards", icon: BarChart3 },
  { id: "hourly", label: "Hourly History", icon: Clock },
  { id: "trainer", label: "Trainer Lookup", icon: Search },
  { id: "ai_chat", label: "AI Chat", icon: MessageSquare },
  { id: "status", label: "Sync & API", icon: Server },
];

export function Sidebar({ activeSection, onSelect, mobileOpen, onCloseMobile }: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200 px-4 py-5">
      <div>
        <div className="flex items-center justify-between px-2 pb-6">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onSelect("leaderboards");
              onCloseMobile();
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            LilyAi Tracker
          </a>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onCloseMobile();
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 text-left ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 pt-4 px-2 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-700">Game Reset Schedule</p>
        <p className="font-mono tabular-nums">15:00 UTC · 00:00 JST</p>
        <a
          href="/api/v1/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-block pt-1 text-blue-600 hover:underline"
        >
          Open API reference
        </a>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block lg:w-60 lg:shrink-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 h-full w-64 max-w-[80vw]">{navContent}</aside>
        </div>
      )}
    </>
  );
}
