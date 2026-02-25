import * as echarts from "echarts/core";
import { MapChart } from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";
import { TooltipComponent } from "echarts/components";
import type { MapRegionFeature } from "@/shared/types/map";
import { resolveAppAsset } from "@/shared/utils/assets";

echarts.use([MapChart, CanvasRenderer, TooltipComponent]);

interface GeoFeatureProperties {
  name?: string;
  adcode?: string;
  code?: string;
}

interface GeoFeature {
  properties?: GeoFeatureProperties;
}

interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

const loadedGeoJsonCache = new Map<string, GeoFeatureCollection>();
const registeredMapNames = new Set<string>();

function resolveGeoUrl(path: string): string {
  return resolveAppAsset(path);
}

function isGeoFeatureCollection(input: unknown): input is GeoFeatureCollection {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const value = input as { type?: unknown; features?: unknown };
  return value.type === "FeatureCollection" && Array.isArray(value.features);
}

function extractMapRegions(geoJson: GeoFeatureCollection): MapRegionFeature[] {
  return geoJson.features
    .map((feature) => {
      const props = feature.properties ?? {};

      return {
        name: String(props.name ?? ""),
        code: String(props.adcode ?? props.code ?? ""),
      };
    })
    .filter((region) => region.name && region.code);
}

export async function ensureMapRegistered(mapName: string, geoPath: string): Promise<MapRegionFeature[]> {
  const cachedGeo = loadedGeoJsonCache.get(geoPath);

  if (cachedGeo && registeredMapNames.has(mapName)) {
    return extractMapRegions(cachedGeo);
  }

  let geoJson = cachedGeo;

  if (!geoJson) {
    const response = await fetch(resolveGeoUrl(geoPath));

    if (!response.ok) {
      throw new Error(`地图文件加载失败: ${response.status}`);
    }

    const parsed = (await response.json()) as unknown;

    if (!isGeoFeatureCollection(parsed)) {
      throw new Error("地图文件格式错误");
    }

    geoJson = parsed;
    loadedGeoJsonCache.set(geoPath, geoJson);
  }

  if (!registeredMapNames.has(mapName)) {
    echarts.registerMap(mapName, geoJson as never);
    registeredMapNames.add(mapName);
  }

  return extractMapRegions(geoJson);
}

export { echarts };
