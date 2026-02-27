import rawConfig from "@/app/app-config.json";

const FALLBACK_DEFAULT_ZOOM = 2.1;
const FALLBACK_LABEL_HIDE_ZOOM_THRESHOLD = 1.45;
const FALLBACK_INITIAL_OFFSET_X_PERCENT = 0;
const FALLBACK_INITIAL_OFFSET_Y_PERCENT = -8;
const FALLBACK_REGION_BORDER_COLOR = "#93a9bc";
const FALLBACK_REGION_BACKGROUND_COLOR = "#edf3f8";
const FALLBACK_CITY_PROVINCE_BOUNDARY_COLOR = "#5c7287";
const FALLBACK_SHOW_CITY_PROVINCE_BOUNDARY = true;
const FALLBACK_FOOTPRINT_PALETTE = ["#ec7063", "#f4b350", "#3db9a4", "#52a7d7", "#7f8dd7", "#d17ec2", "#4f6a7b"];
const OFFSET_PERCENT_MIN = -30;
const OFFSET_PERCENT_MAX = 30;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function toBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function toColorString(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  return value.trim();
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "boolean") {
    return fallback;
  }

  return value;
}

function toPalette(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const colors = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => HEX_COLOR.test(item));

  if (colors.length === 0) {
    return [...fallback];
  }

  return colors;
}

export const appConfig = {
  map: {
    defaultZoom: toPositiveNumber(rawConfig.map?.defaultZoom, FALLBACK_DEFAULT_ZOOM),
    labelHideZoomThreshold: toPositiveNumber(
      rawConfig.map?.labelHideZoomThreshold,
      FALLBACK_LABEL_HIDE_ZOOM_THRESHOLD
    ),
    showCityProvinceBoundary: toBoolean(
      rawConfig.map?.showCityProvinceBoundary,
      FALLBACK_SHOW_CITY_PROVINCE_BOUNDARY
    ),
    initialOffsetPercent: {
      x: toBoundedNumber(
        rawConfig.map?.initialOffsetPercent?.x,
        FALLBACK_INITIAL_OFFSET_X_PERCENT,
        OFFSET_PERCENT_MIN,
        OFFSET_PERCENT_MAX
      ),
      y: toBoundedNumber(
        rawConfig.map?.initialOffsetPercent?.y,
        FALLBACK_INITIAL_OFFSET_Y_PERCENT,
        OFFSET_PERCENT_MIN,
        OFFSET_PERCENT_MAX
      ),
    },
    colors: {
      regionBorder: toColorString(rawConfig.map?.colors?.regionBorder, FALLBACK_REGION_BORDER_COLOR),
      regionBackground: toColorString(rawConfig.map?.colors?.regionBackground, FALLBACK_REGION_BACKGROUND_COLOR),
      cityProvinceBoundary: toColorString(
        rawConfig.map?.colors?.cityProvinceBoundary,
        FALLBACK_CITY_PROVINCE_BOUNDARY_COLOR
      ),
    },
  },
  footprint: {
    palette: toPalette(rawConfig.footprint?.palette, FALLBACK_FOOTPRINT_PALETTE),
  },
} as const;
