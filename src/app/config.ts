import rawConfig from "@/app/app-config.json";

const FALLBACK_DEFAULT_ZOOM = 2.1;
const FALLBACK_LABEL_HIDE_ZOOM_THRESHOLD = 1.45;
const FALLBACK_INITIAL_OFFSET_X_PERCENT = 0;
const FALLBACK_INITIAL_OFFSET_Y_PERCENT = -8;
const OFFSET_PERCENT_MIN = -30;
const OFFSET_PERCENT_MAX = 30;

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

export const appConfig = {
  map: {
    defaultZoom: toPositiveNumber(rawConfig.map?.defaultZoom, FALLBACK_DEFAULT_ZOOM),
    labelHideZoomThreshold: toPositiveNumber(
      rawConfig.map?.labelHideZoomThreshold,
      FALLBACK_LABEL_HIDE_ZOOM_THRESHOLD
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
  },
} as const;
