import type { RegionKey } from "@/shared/types/footprint";

export function makeRegionMarkKey(region: RegionKey): string {
  return `${region.level}:${region.code}`;
}
