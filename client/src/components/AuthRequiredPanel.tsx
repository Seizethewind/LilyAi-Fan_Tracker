import { KeyRound, ServerCrash } from "lucide-react";
import { ClientApiError } from "../api";

interface AuthRequiredPanelProps {
  error: ClientApiError;
  onOpenApiKeyModal: () => void;
  onRetry: () => void;
}

export function AuthRequiredPanel({
  error,
  onOpenApiKeyModal,
  onRetry,
}: AuthRequiredPanelProps) {
  const isDisabled = error.status === 503 || error.code === "api_disabled";
  const isUnauthorized = error.status === 401 || error.status === 403;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8">
      <div className="max-w-xl space-y-3">
        <div className="flex items-center gap-2.5 text-slate-900">
          {isDisabled ? (
            <ServerCrash className="h-5 w-5 text-amber-600 shrink-0" />
          ) : (
            <KeyRound className="h-5 w-5 text-blue-600 shrink-0" />
          )}
          <h2 className="text-base font-semibold">
            {isDisabled
              ? "Server API keys are not configured"
              : isUnauthorized
                ? "Bearer API key required"
                : "Could not load API data"}
          </h2>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          {isDisabled ? (
            <>
              Private API endpoints fail closed (<span className="font-mono">503 api_disabled</span>) until{" "}
              <span className="font-mono">API_READ_KEY</span> or{" "}
              <span className="font-mono">API_WRITE_KEY</span> is set in the server environment.
            </>
          ) : isUnauthorized ? (
            <>
              This endpoint requires a valid <span className="font-mono">Authorization: Bearer</span> key.
              Enter your configured read or write key to view live club data.
            </>
          ) : (
            <>
              <span className="font-mono text-rose-700">{error.code}</span> · {error.message}
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!isDisabled && (
            <button
              type="button"
              onClick={onOpenApiKeyModal}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Enter API Key</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Retry Request
          </button>
        </div>
      </div>
    </div>
  );
}
