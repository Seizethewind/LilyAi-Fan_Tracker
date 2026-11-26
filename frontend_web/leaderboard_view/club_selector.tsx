import { ClubSummary } from "../api_client/frontend_types";

interface ClubSelectorProps {
  clubs: ClubSummary[];
  selectedClub: string;
  onSelectClub: (key: string) => void;
}

export function ClubSelector({ clubs, selectedClub, onSelectClub }: ClubSelectorProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {clubs.map((club) => {
        const active = club.key === selectedClub;
        return (
          <button
            key={club.key}
            type="button"
            onClick={() => onSelectClub(club.key)}
            className={`min-h-9 cursor-pointer rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              active
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {club.name || club.label}
          </button>
        );
      })}
    </div>
  );
}
