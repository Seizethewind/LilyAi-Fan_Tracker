import { Settings } from "../configuration/config_types.js";
import { MemoryStore } from "./fan_store.js";
import { StoreAdapter } from "./store_adapter.js";
import { TursoStore } from "./turso_store.js";

export function buildStore(settings: Settings): StoreAdapter {
  if (settings.tursoUrl && settings.tursoToken) {
    return new TursoStore(settings.tursoUrl, settings.tursoToken);
  }
  return new MemoryStore();
}
