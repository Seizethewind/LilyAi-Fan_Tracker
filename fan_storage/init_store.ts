import { Settings } from "../configuration/config_types.js";
import { buildStore } from "./build_store.js";
import { MemoryStore } from "./fan_store.js";
import { StoreAdapter } from "./store_adapter.js";

export async function initStore(settings: Settings): Promise<StoreAdapter> {
  const store = buildStore(settings);
  try {
    await store.init();
    return store;
  } catch (err) {
    await store.close().catch(() => {});
    if (settings.onRender) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`Store initialization failed (${detail}); falling back to in-memory store.`);
    const fallback = new MemoryStore();
    await fallback.init();
    return fallback;
  }
}
