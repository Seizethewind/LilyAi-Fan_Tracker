import { Search } from "lucide-react";

interface MemberSearchFormProps {
  trainerId: string;
  onTrainerIdChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function MemberSearchForm({
  trainerId,
  onTrainerIdChange,
  onSubmit,
  loading,
}: MemberSearchFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="text"
          value={trainerId}
          onChange={(e) => onTrainerIdChange(e.target.value)}
          placeholder="Enter Trainer ID (e.g. 123456789)"
          aria-label="Trainer ID"
          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !trainerId.trim()}
        className="min-h-10 cursor-pointer rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Searching..." : "Look Up Trainer"}
      </button>
    </form>
  );
}
