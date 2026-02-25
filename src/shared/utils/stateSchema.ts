import type { FootprintStateV1, RegionKey, RegionLevel, VisitMark } from "@/shared/types/footprint";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const REGION_LEVELS: RegionLevel[] = ["country", "province", "city"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegionKey(value: unknown): value is RegionKey {
  if (!isObject(value)) {
    return false;
  }

  const level = value.level;
  const code = value.code;

  return typeof level === "string" && REGION_LEVELS.includes(level as RegionLevel) && typeof code === "string";
}

function isVisitMark(value: unknown): value is VisitMark {
  if (!isObject(value)) {
    return false;
  }

  return (
    isRegionKey(value.region) &&
    typeof value.color === "string" &&
    HEX_COLOR.test(value.color) &&
    typeof value.updatedAt === "string"
  );
}

export function parseFootprintStateV1(input: unknown): FootprintStateV1 | null {
  if (!isObject(input)) {
    return null;
  }

  if (input.version !== 1) {
    return null;
  }

  if (typeof input.selectedColor !== "string" || !HEX_COLOR.test(input.selectedColor)) {
    return null;
  }

  if (!isRegionKey(input.currentView)) {
    return null;
  }

  if (!isObject(input.marks)) {
    return null;
  }

  const marks: Record<string, VisitMark> = {};

  for (const [key, value] of Object.entries(input.marks)) {
    if (!isVisitMark(value)) {
      return null;
    }

    marks[key] = value;
  }

  return {
    version: 1,
    selectedColor: input.selectedColor,
    currentView: input.currentView,
    marks,
  };
}

export function migrateFootprintState(input: unknown): FootprintStateV1 | null {
  return parseFootprintStateV1(input);
}
