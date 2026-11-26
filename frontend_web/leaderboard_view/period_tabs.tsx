import { Period } from "../api_client/frontend_types";

interface PeriodTabsProps {
  period: Period;
  onSelectPeriod: (period: Period) => void;
}

const PERIOD_OPTIONS: ReadonlyArray<{ id: Period; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

export function PeriodTabs({ period, onSelectPeriod }: PeriodTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {PERIOD_OPTIONS.map((opt) => {
        const active = opt.id === period;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelectPeriod(opt.id)}
            className={`min-h-9 cursor-pointer rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              active
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
