import type { FootprintStateV1 } from "@/shared/types/footprint";

export interface StorageAdapter {
  load(): Promise<FootprintStateV1 | null>;
  save(state: FootprintStateV1): Promise<void>;
  clear(): Promise<void>;
}
