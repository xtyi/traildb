import localforage from "localforage";
import type { FootprintStateV1 } from "@/shared/types/footprint";
import type { StorageAdapter } from "@/services/storage/storageAdapter";
import { migrateFootprintState } from "@/shared/utils/stateSchema";

const KEY = "traildb:footprint:v1";

const db = localforage.createInstance({
  name: "traildb",
  storeName: "footprint",
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});

export const localStorageAdapter: StorageAdapter = {
  async load(): Promise<FootprintStateV1 | null> {
    const raw = await db.getItem<unknown>(KEY);

    if (!raw) {
      return null;
    }

    return migrateFootprintState(raw);
  },

  async save(state: FootprintStateV1): Promise<void> {
    await db.setItem(KEY, state);
  },

  async clear(): Promise<void> {
    await db.removeItem(KEY);
  },
};
