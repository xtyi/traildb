import type { MapCatalog } from "@/shared/types/map";
import { resolveAppAsset } from "@/shared/utils/assets";

let catalogCache: MapCatalog | null = null;

function mapCatalogUrl(): string {
  return resolveAppAsset("geo/map-index.json");
}

export async function loadMapCatalog(): Promise<MapCatalog> {
  if (catalogCache) {
    return catalogCache;
  }

  const response = await fetch(mapCatalogUrl());

  if (!response.ok) {
    throw new Error(`地图索引加载失败: ${response.status}`);
  }

  const data = (await response.json()) as MapCatalog;
  catalogCache = data;

  return data;
}

export function clearCatalogCache(): void {
  catalogCache = null;
}
