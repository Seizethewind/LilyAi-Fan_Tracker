import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";

interface ApiKeyModalProps {
  open: boolean;
  currentKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}

export function ApiKeyModal({ open, currentKey, onSave, onClose }: ApiKeyModalProps) {
  const [value, setValue] = useState(currentKey);

  useEffect(() => {
    if (open) {
      setValue(currentKey);
    }
  }, [open, currentKey]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave(value.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="api-key-modal-title" className="text-base font-semibold text-slate-900">
              API Bearer Key
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Kept in memory for this open tab only and sent as{" "}
              <code className="font-mono text-xs text-slate-800">Authorization: Bearer</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="bearer-key-input" className="block text-xs font-medium text-slate-700">
              Read or Write Key
            </label>
            <input
              id="bearer-key-input"
              type="password"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste API_READ_KEY or API_WRITE_KEY"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Read key unlocks GET endpoints; write key also enables manual club syncs.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            {currentKey && (
              <button
                type="button"
                onClick={() => {
                  onSave("");
                  onClose();
                }}
                className="mr-auto rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
              >
                Clear Key
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Save Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
