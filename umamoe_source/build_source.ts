import { Settings } from "../configuration/config_types.js";
import { FanSource, SourceError } from "./source_error.js";
import { UmaMoeClient } from "./umamoe_client.js";

export function buildSource(settings: Settings): FanSource {
  try {
    return new UmaMoeClient(settings.umamoeApiKey);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(reason);
    return {
      async fetchClub() {
        throw new SourceError(reason);
      },
    };
  }
}
