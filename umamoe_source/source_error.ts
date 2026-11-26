import { ClubSnapshot } from "../domain_models/types.js";

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export interface FanSource {
  fetchClub(clubId: string): Promise<ClubSnapshot>;
  currentClub?(trainerId: string): Promise<string | null>;
}
