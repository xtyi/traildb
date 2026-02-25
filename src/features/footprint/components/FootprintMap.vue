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

const props = defineProps<{
  mapName: string;
  regions: MapRegionFeature[];
  marks: Record<string, VisitMark>;
  viewLevel: RegionLevel;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: "region-click", payload: { name: string; code: string; x: number; y: number }): void;
}>();

const mapElement = ref<HTMLElement | null>(null);
let chart: ECharts | null = null;
const DEFAULT_ZOOM = appConfig.map.defaultZoom;
const LABEL_HIDE_ZOOM_THRESHOLD = appConfig.map.labelHideZoomThreshold;
const MAP_SERIES_ID = "footprint-map-series";
const MAP_LAYOUT_SIZE = "100%";
const currentZoom = ref(DEFAULT_ZOOM);
let lastRenderedMapName: string | null = null;

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

function isLabelVisibleByZoom(zoom: number): boolean {
  return !shouldHideAllLabelsByZoom(zoom);
}

function initialLayoutCenter(): [string, string] {
  const centerX = 50 + appConfig.map.initialOffsetPercent.x;
  const centerY = 50 + appConfig.map.initialOffsetPercent.y;

  return [`${centerX}%`, `${centerY}%`];
}

function readChartZoom(): number {
  if (!chart) {
    return currentZoom.value;
  }

  const option = chart.getOption();
  const series = (Array.isArray(option.series) ? option.series[0] : null) as { zoom?: number | number[] } | null;
  const zoomValue = Array.isArray(series?.zoom) ? Number(series?.zoom[0]) : Number(series?.zoom);

  if (!Number.isFinite(zoomValue) || zoomValue <= 0) {
    return currentZoom.value;
  }

  return zoomValue;
}

function handleGeoRoam(): void {
  const nextZoom = readChartZoom();

  if (Math.abs(nextZoom - currentZoom.value) < 0.001) {
    return;
  }

  const wasLabelVisible = isLabelVisibleByZoom(currentZoom.value);
  const willLabelVisible = isLabelVisibleByZoom(nextZoom);
  currentZoom.value = nextZoom;

  if (wasLabelVisible !== willLabelVisible) {
    chart?.setOption(
      {
        animationDurationUpdate: 0,
        series: [
          {
            id: MAP_SERIES_ID,
            label: {
              show: willLabelVisible,
            },
          },
        ],
      },
      {
        lazyUpdate: true,
      }
    );
  }
}

function render(): void {
  if (!chart || !props.mapName) {
    return;
  }

  const isNewMap = lastRenderedMapName !== props.mapName;
  const data = props.regions.map((region) => {
    const mark = markForRegion(region.code);

    return {
      name: region.name,
      adcode: region.code,
      value: mark ? 1 : 0,
      itemStyle: mark
        ? {
            areaColor: mark.color,
            borderColor: "#5f7f98",
            borderWidth: 1,
          }
        : undefined,
    };
  });

  chart.setOption(
    {
      tooltip: {
        show: false,
      },
      series: [
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
            show: isLabelVisibleByZoom(currentZoom.value),
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
            areaColor: "#edf3f8",
            borderColor: "#93a9bc",
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
      ],
      animationDurationUpdate: 260,
    }
  );
  lastRenderedMapName = props.mapName;
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

  if (chart) {
    chart.off("click", handleRegionClick as never);
    chart.off("georoam", handleGeoRoam as never);
    chart.dispose();
    chart = null;
  }
  lastRenderedMapName = null;
});

watch(
  () => [props.mapName, props.regions, props.marks, props.viewLevel],
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
