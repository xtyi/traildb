<template>
  <div class="map-wrap">
    <div ref="mapElement" class="map-canvas" />
    <div v-if="loading" class="map-overlay">地图加载中...</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ECharts } from "echarts/core";
import { echarts } from "@/features/footprint/services/mapRuntime";
import type { RegionLevel, VisitMark } from "@/shared/types/footprint";
import type { MapRegionFeature } from "@/shared/types/map";
import { getRegionDisplayName, shouldHideCountryLabel } from "@/shared/utils/regionDisplay";
import { appConfig } from "@/app/config";

interface MapFocusRequest {
  token: number;
  code: string;
  center?: [number, number];
  zoom?: number;
  durationMs?: number;
}

const props = defineProps<{
  mapName: string;
  provinceBoundaryMapName?: string | null;
  regions: MapRegionFeature[];
  marks: Record<string, VisitMark>;
  viewLevel: RegionLevel;
  hideBaseLabelsByDefault?: boolean;
  focusRequest?: MapFocusRequest | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: "region-click", payload: { name: string; code: string; x: number; y: number }): void;
}>();

const mapElement = ref<HTMLElement | null>(null);
let chart: ECharts | null = null;
const DEFAULT_ZOOM = appConfig.map.defaultZoom;
const LABEL_HIDE_ZOOM_THRESHOLD = appConfig.map.labelHideZoomThreshold;
const MAP_REGION_BORDER_COLOR = appConfig.map.colors.regionBorder;
const MAP_REGION_BACKGROUND_COLOR = appConfig.map.colors.regionBackground;
const CITY_PROVINCE_BOUNDARY_COLOR = appConfig.map.colors.cityProvinceBoundary;
const MAP_SERIES_ID = "footprint-map-series";
const PROVINCE_BOUNDARY_SERIES_ID = "province-boundary-overlay";
const MAP_LAYOUT_SIZE = "100%";
const currentZoom = ref(DEFAULT_ZOOM);
const currentCenter = ref<[number, number] | null>(null);
let lastRenderedMapName: string | null = null;
let lastAppliedFocusToken: number | null = null;
let blinkIntervalTimer: ReturnType<typeof setInterval> | null = null;
let blinkStopTimer: ReturnType<typeof setTimeout> | null = null;
let activeBlinkDataIndex: number | null = null;

const markLevel = computed<RegionLevel>(() => (props.viewLevel === "country" ? "province" : "city"));

function markForRegion(regionCode: string): VisitMark | undefined {
  return props.marks[`${markLevel.value}:${regionCode}`];
}

function shouldHideBaseLabel(regionCode: string): boolean {
  return props.viewLevel === "country" && shouldHideCountryLabel(regionCode);
}

function shouldHideAllLabelsByZoom(zoom: number): boolean {
  return zoom <= LABEL_HIDE_ZOOM_THRESHOLD;
}

function shouldShowBaseLabels(zoom: number): boolean {
  if (props.hideBaseLabelsByDefault) {
    return false;
  }

  return !shouldHideAllLabelsByZoom(zoom);
}

function initialLayoutCenter(): [string, string] {
  const centerX = 50 + appConfig.map.initialOffsetPercent.x;
  const centerY = 50 + appConfig.map.initialOffsetPercent.y;

  return [`${centerX}%`, `${centerY}%`];
}

function toCenter(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const x = Number(value[0]);
  const y = Number(value[1]);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return [x, y];
}

function sameCenter(a: [number, number] | null, b: [number, number] | null): boolean {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return Math.abs(a[0] - b[0]) < 0.0001 && Math.abs(a[1] - b[1]) < 0.0001;
}

function readChartViewport(): { zoom: number; center: [number, number] | null } {
  if (!chart) {
    return {
      zoom: currentZoom.value,
      center: currentCenter.value,
    };
  }

  const option = chart.getOption();
  const series = (Array.isArray(option.series) ? option.series[0] : null) as {
    zoom?: number | number[];
    center?: unknown;
  } | null;
  const zoomValue = Array.isArray(series?.zoom) ? Number(series?.zoom[0]) : Number(series?.zoom);
  const parsedCenter = toCenter(series?.center);

  if (!Number.isFinite(zoomValue) || zoomValue <= 0) {
    return {
      zoom: currentZoom.value,
      center: parsedCenter ?? currentCenter.value,
    };
  }

  return {
    zoom: zoomValue,
    center: parsedCenter,
  };
}

function handleGeoRoam(): void {
  const { zoom: nextZoom, center: nextCenter } = readChartViewport();
  const zoomUnchanged = Math.abs(nextZoom - currentZoom.value) < 0.001;
  const centerUnchanged = sameCenter(nextCenter, currentCenter.value);

  if (zoomUnchanged && centerUnchanged) {
    return;
  }

  const wasLabelVisible = shouldShowBaseLabels(currentZoom.value);
  const willLabelVisible = shouldShowBaseLabels(nextZoom);
  const updates: Array<Record<string, unknown>> = [];

  if (props.provinceBoundaryMapName) {
    const boundaryUpdate: Record<string, unknown> = {
      id: PROVINCE_BOUNDARY_SERIES_ID,
      zoom: nextZoom,
    };

    if (nextCenter) {
      boundaryUpdate.center = nextCenter;
    }

    updates.push(boundaryUpdate);
  }

  if (wasLabelVisible !== willLabelVisible) {
    updates.push({
      id: MAP_SERIES_ID,
      label: {
        show: willLabelVisible,
      },
    });
  }

  currentZoom.value = nextZoom;
  currentCenter.value = nextCenter;

  if (updates.length > 0) {
    chart?.setOption(
      {
        animationDurationUpdate: 0,
        series: updates,
      },
      {
        lazyUpdate: true,
      }
    );
  }
}

function stopRegionBlink(): void {
  if (blinkIntervalTimer) {
    clearInterval(blinkIntervalTimer);
    blinkIntervalTimer = null;
  }

  if (blinkStopTimer) {
    clearTimeout(blinkStopTimer);
    blinkStopTimer = null;
  }

  if (chart && activeBlinkDataIndex !== null) {
    chart.dispatchAction({
      type: "downplay",
      seriesId: MAP_SERIES_ID,
      dataIndex: activeBlinkDataIndex,
    });
  }

  activeBlinkDataIndex = null;
}

function startRegionBlink(dataIndex: number, durationMs: number): void {
  stopRegionBlink();

  if (!chart) {
    return;
  }

  let highlighted = false;
  activeBlinkDataIndex = dataIndex;
  const toggle = () => {
    if (!chart || activeBlinkDataIndex === null) {
      return;
    }

    chart.dispatchAction({
      type: highlighted ? "downplay" : "highlight",
      seriesId: MAP_SERIES_ID,
      dataIndex: activeBlinkDataIndex,
    });
    highlighted = !highlighted;
  };

  toggle();
  blinkIntervalTimer = setInterval(toggle, 450);
  blinkStopTimer = setTimeout(() => {
    stopRegionBlink();
  }, durationMs);
}

function applyFocusRequest(): void {
  const request = props.focusRequest;
  if (!chart || !request || request.token === lastAppliedFocusToken) {
    return;
  }

  const dataIndex = props.regions.findIndex((region) => region.code === request.code);
  if (dataIndex < 0) {
    return;
  }

  const updates: Array<Record<string, unknown>> = [];
  const baseUpdate: Record<string, unknown> = {
    id: MAP_SERIES_ID,
  };

  if (typeof request.zoom === "number" && Number.isFinite(request.zoom) && request.zoom > 0) {
    baseUpdate.zoom = request.zoom;
    currentZoom.value = request.zoom;
  }

  if (request.center) {
    baseUpdate.center = request.center;
    currentCenter.value = request.center;
  }

  if (Object.keys(baseUpdate).length > 1) {
    updates.push(baseUpdate);
  }

  if (props.provinceBoundaryMapName) {
    const boundaryUpdate: Record<string, unknown> = {
      id: PROVINCE_BOUNDARY_SERIES_ID,
    };

    if (typeof request.zoom === "number" && Number.isFinite(request.zoom) && request.zoom > 0) {
      boundaryUpdate.zoom = request.zoom;
    }

    if (request.center) {
      boundaryUpdate.center = request.center;
    }

    if (Object.keys(boundaryUpdate).length > 1) {
      updates.push(boundaryUpdate);
    }
  }

  if (updates.length > 0) {
    chart.setOption(
      {
        animationDurationUpdate: 320,
        series: updates,
      },
      {
        lazyUpdate: true,
      }
    );
  }

  startRegionBlink(dataIndex, request.durationMs ?? 5000);
  lastAppliedFocusToken = request.token;
}

function render(): void {
  if (!chart || !props.mapName) {
    return;
  }

  const isNewMap = lastRenderedMapName !== props.mapName;
  if (isNewMap) {
    currentCenter.value = null;
  }
  const data = props.regions.map((region) => {
    const mark = markForRegion(region.code);

    return {
      name: region.name,
      adcode: region.code,
      value: mark ? 1 : 0,
      itemStyle: mark
        ? {
            areaColor: mark.color,
            borderColor: MAP_REGION_BORDER_COLOR,
            borderWidth: 1,
          }
        : undefined,
    };
  });

  const series: Array<Record<string, unknown>> = [
    {
      type: "map",
      id: MAP_SERIES_ID,
      map: props.mapName,
      roam: true,
      zoom: currentZoom.value,
      selectedMode: false,
      ...(isNewMap
        ? {
            layoutCenter: initialLayoutCenter(),
            layoutSize: MAP_LAYOUT_SIZE,
          }
        : {}),
      label: {
        show: shouldShowBaseLabels(currentZoom.value),
        color: "#000000",
        fontSize: 10,
        formatter: (params: { name?: string; data?: { adcode?: string } }) => {
          const code = String(params.data?.adcode ?? "");
          if (shouldHideBaseLabel(code)) {
            return "";
          }
          return getRegionDisplayName(String(params.name ?? ""), code);
        },
      },
      itemStyle: {
        areaColor: MAP_REGION_BACKGROUND_COLOR,
        borderColor: MAP_REGION_BORDER_COLOR,
        borderWidth: 1,
      },
      emphasis: {
        label: {
          show: true,
          color: "#000000",
          formatter: (params: { name?: string; data?: { adcode?: string } }) =>
            getRegionDisplayName(String(params.name ?? ""), String(params.data?.adcode ?? "")),
        },
        itemStyle: {
          areaColor: "#d8e5f2",
        },
      },
      data,
    },
  ];

  const showProvinceBoundary = Boolean(props.provinceBoundaryMapName);
  const boundaryMapName = props.provinceBoundaryMapName ?? props.mapName;

  series.push({
    type: "map",
    id: PROVINCE_BOUNDARY_SERIES_ID,
    map: boundaryMapName,
    roam: false,
    silent: true,
    zoom: currentZoom.value,
    selectedMode: false,
    ...(isNewMap
      ? {
          layoutCenter: initialLayoutCenter(),
          layoutSize: MAP_LAYOUT_SIZE,
        }
      : {}),
    ...(currentCenter.value
      ? {
          center: currentCenter.value,
        }
      : {}),
    label: {
      show: false,
    },
    itemStyle: {
      areaColor: "rgba(0,0,0,0)",
      borderColor: showProvinceBoundary ? CITY_PROVINCE_BOUNDARY_COLOR : "rgba(0,0,0,0)",
      borderWidth: showProvinceBoundary ? 1 : 0,
    },
    emphasis: {
      label: {
        show: false,
      },
      itemStyle: {
        areaColor: "rgba(0,0,0,0)",
        borderColor: showProvinceBoundary ? CITY_PROVINCE_BOUNDARY_COLOR : "rgba(0,0,0,0)",
        borderWidth: showProvinceBoundary ? 1 : 0,
      },
    },
    z: showProvinceBoundary ? 8 : -1,
  });

  chart.setOption({
    tooltip: {
      show: false,
    },
    series,
    animationDurationUpdate: 260,
  });
  lastRenderedMapName = props.mapName;
  applyFocusRequest();
}

function resize(): void {
  chart?.resize();
}

function handleRegionClick(params: unknown): void {
  const payload = params as {
    name?: unknown;
    data?: { adcode?: unknown } | null;
    event?: { offsetX?: unknown; offsetY?: unknown } | null;
  };
  const name = String(payload.name ?? "");
  const code = String(payload.data?.adcode ?? "");
  const x = Number(payload.event?.offsetX ?? 0);
  const y = Number(payload.event?.offsetY ?? 0);

  if (!name || !code) {
    return;
  }

  emit("region-click", { name: getRegionDisplayName(name, code), code, x, y });
}

onMounted(() => {
  if (!mapElement.value) {
    return;
  }

  chart = echarts.init(mapElement.value);
  chart.on("click", handleRegionClick as never);
  chart.on("georoam", handleGeoRoam as never);

  render();
  window.addEventListener("resize", resize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  stopRegionBlink();

  if (chart) {
    chart.off("click", handleRegionClick as never);
    chart.off("georoam", handleGeoRoam as never);
    chart.dispose();
    chart = null;
  }
  lastRenderedMapName = null;
});

watch(
  () => [
    props.mapName,
    props.provinceBoundaryMapName,
    props.regions,
    props.marks,
    props.viewLevel,
    props.hideBaseLabelsByDefault,
    props.focusRequest?.token,
  ],
  () => {
    render();
  },
  { deep: true }
);
</script>

<style scoped>
.map-wrap {
  position: relative;
  min-height: clamp(760px, 92vh, 1380px);
}

.map-canvas {
  width: 100%;
  height: clamp(760px, 92vh, 1380px);
}

.map-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ink-soft);
  font-size: 0.95rem;
  background: rgba(255, 255, 255, 0.86);
}

@media (max-width: 720px) {
  .map-wrap,
  .map-canvas {
    min-height: 78vh;
    height: 78vh;
  }
}
</style>
