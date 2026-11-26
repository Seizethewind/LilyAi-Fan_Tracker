import { KeyRound, Menu, RefreshCw } from "lucide-react";

interface TopBarProps {
  breadcrumbs: string[];
  hasApiKey: boolean;
  syncing: boolean;
  onOpenMobileNav: () => void;
  onOpenApiKeyModal: () => void;
  onSyncNow: () => void;
}

export function TopBar({
  breadcrumbs,
  hasApiKey,
  syncing,
  onOpenMobileNav,
  onOpenApiKeyModal,
  onSyncNow,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="lg:hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <Menu className="h-4 w-4" />
        </button>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <span key={`${crumb}-${idx}`} className="flex min-w-0 items-center gap-2">
                {idx > 0 && (
                  <span className="text-slate-400 select-none" aria-hidden="true">
                    /
                  </span>
                )}
                <span
                  className={`truncate ${
                    isLast ? "font-semibold text-slate-900" : "text-slate-500 hidden sm:inline"
                  }`}
                >
                  {crumb}
                </span>
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onOpenApiKeyModal}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span>{hasApiKey ? "API Key Set" : "API Key"}</span>
        </button>

        <button
          type="button"
          onClick={onSyncNow}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          <span>{syncing ? "Syncing..." : "Sync Now"}</span>
        </button>
      </div>
    </header>
  );
}
