import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ClientApiError, fetchHealth, fetchOpenApi, fetchStatus } from "../api";
import { formatUtcDateTime } from "../format";
import { HealthResponse, OpenApiSpec, StatusResponse, SyncResponse } from "../types";
import { AuthRequiredPanel } from "./AuthRequiredPanel";

interface StatusDocsViewProps {
  apiKeyVersion: number;
  syncVersion: number;
  lastSyncResult: SyncResponse | null;
  lastSyncError: ClientApiError | null;
  onOpenApiKeyModal: () => void;
  onSyncNow: () => void;
}

export function StatusDocsView({
  apiKeyVersion,
  syncVersion,
  lastSyncResult,
  lastSyncError,
  onOpenApiKeyModal,
  onSyncNow,
}: StatusDocsViewProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [openApi, setOpenApi] = useState<OpenApiSpec | null>(null);
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<ClientApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setStatusError(null);
    const [healthRes, specRes] = await Promise.allSettled([fetchHealth(), fetchOpenApi()]);
    if (healthRes.status === "fulfilled") setHealth(healthRes.value);
    if (specRes.status === "fulfilled") setOpenApi(specRes.value);

    try {
      const s = await fetchStatus();
      setStatusData(s);
    } catch (err) {
      if (err instanceof ClientApiError) {
        setStatusError(err);
      } else {
        setStatusError(new ClientApiError(500, "client_error", "Could not reach /api/v1/status"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll, apiKeyVersion, syncVersion]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Sync & API Status</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Service health, club sync timestamps, manual refresh results, and REST endpoints.
          </p>
        </div>

        <button
          type="button"
          onClick={onSyncNow}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Trigger Club Sync</span>
        </button>
      </div>

      {lastSyncError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-xs text-rose-800">
          Sync failed ({lastSyncError.code}): {lastSyncError.message}
          {lastSyncError.retryAfterSeconds ? ` Try again in ${lastSyncError.retryAfterSeconds}s.` : ""}
        </div>
      )}

      {lastSyncResult && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Latest Manual Sync Result</h2>
          <div className="mt-3 divide-y divide-slate-100 text-xs">
            {lastSyncResult.results.map((r) => (
              <div key={r.club} className="flex items-center justify-between py-2">
                <span className="font-mono font-medium text-slate-800">{r.club}</span>
                {r.ok ? (
                  <span className="text-emerald-700 font-mono tabular-nums">
                    Synced · {r.member_count ?? 0} members
                  </span>
                ) : (
                  <span className="text-rose-700">Failed · {r.error}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Server Liveness</h2>
          {health ? (
            <span className="font-mono text-xs text-emerald-700">
              OK · v{health.version}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Checking...</span>
          )}
        </div>
        {statusData && (
          <p className="mt-2 text-xs text-slate-600">
            <span>Server time </span>
            <span className="font-mono tabular-nums">{formatUtcDateTime(statusData.time)}</span>
            <span aria-hidden="true"> · </span>
            <span>Discord gateway: {statusData.discord.state}</span>
            {statusData.discord.error ? ` (${statusData.discord.error})` : ""}
          </p>
        )}
      </section>

      {statusError ? (
        <AuthRequiredPanel
          error={statusError}
          onOpenApiKeyModal={onOpenApiKeyModal}
          onRetry={() => void loadAll()}
        />
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <div className="h-5 w-40 rounded bg-slate-100 animate-pulse" />
          <div className="h-10 rounded bg-slate-100 animate-pulse" />
          <div className="h-10 rounded bg-slate-100 animate-pulse" />
        </div>
      ) : statusData ? (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Configured Clubs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 pl-5 pr-3">Key</th>
                  <th className="py-2.5 px-3">Club ID</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3 text-right">Members</th>
                  <th className="py-2.5 px-3">Last Synced</th>
                  <th className="py-2.5 pl-3 pr-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {statusData.clubs.map((club) => (
                  <tr key={club.key} className="h-10">
                    <td className="pl-5 pr-3 font-mono font-medium text-slate-900">{club.key}</td>
                    <td className="px-3 font-mono text-slate-600 tabular-nums">{club.club_id}</td>
                    <td className="px-3 text-slate-800">{club.name || club.label}</td>
                    <td className="px-3 text-right font-mono text-slate-700 tabular-nums">
                      {club.member_count}
                    </td>
                    <td className="px-3 font-mono text-slate-600 tabular-nums">
                      {formatUtcDateTime(club.last_synced_at)}
                    </td>
                    <td className="pl-3 pr-5">
                      {club.last_error ? (
                        <span className="text-rose-700">Error: {club.last_error}</span>
                      ) : club.last_synced_at ? (
                        <span className="text-emerald-700">Healthy</span>
                      ) : (
                        <span className="text-slate-500">Pending initial sync</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {openApi && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">REST API Endpoints</h2>
            <a
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-blue-600 hover:underline"
            >
              /api/v1/openapi.json
            </a>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {Object.entries(openApi.paths).flatMap(([route, methods]) =>
              Object.entries(methods).map(([method, spec]) => (
                <div
                  key={`${method}-${route}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono font-semibold uppercase text-blue-700 w-10">
                      {method}
                    </span>
                    <span className="font-mono text-slate-900">{route}</span>
                  </div>
                  <span className="text-slate-500">{spec.summary}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
