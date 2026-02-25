<template>
  <section class="footprint-page">
    <div ref="mapStageRef" class="map-stage">
      <div class="map-floating-controls">
        <div class="map-nav-panel">
          <BreadcrumbNav country-label="中国" :province-name="currentProvinceName" @go-country="goCountryView" />
          <n-button v-if="isProvinceView" size="small" secondary @click="goCountryView">返回全国</n-button>
        </div>

        <n-alert v-if="mapError" type="error" :show-icon="false" class="status-alert">{{ mapError }}</n-alert>
        <n-alert v-else-if="storeError" type="error" :show-icon="false" class="status-alert">{{ storeError }}</n-alert>
      </div>

      <FootprintMap
        :map-name="activeMapName"
        :regions="regions"
        :marks="store.state.marks"
        :view-level="store.state.currentView.level"
        :loading="isMapLoading"
        @region-click="handleRegionClick"
      />

      <transition name="picker-fade">
        <div
          v-if="picker.visible && picker.region"
          class="region-picker"
          :style="{ left: `${picker.x}px`, top: `${picker.y}px` }"
        >
          <p class="picker-title">{{ picker.region.name }}</p>
          <p class="picker-sub">选一个颜色，立即标记</p>

          <div class="swatch-grid">
            <button
              v-for="color in store.palette"
              :key="color"
              type="button"
              class="swatch"
              :class="{ 'is-selected': currentRegionMarkColor === color }"
              :style="{ background: color }"
              @click="applyMarkColor(color)"
            />
          </div>

          <div class="picker-meta">
            <n-tag size="small" :bordered="false" type="info">{{ markLevelLabel }}</n-tag>
            <span v-if="currentRegionMarkColor">已标记：{{ currentRegionMarkColor }}</span>
            <span v-else>未标记</span>
          </div>

          <div class="picker-actions">
            <n-button text size="tiny" @click="clearCurrentRegionMark">清除</n-button>
            <n-button v-if="canDrillDown" text size="tiny" @click="drillDownToProvince">进入市级</n-button>
            <n-button text size="tiny" @click="closePicker">关闭</n-button>
          </div>
        </div>
      </transition>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { NAlert, NButton, NTag } from "naive-ui";
import BreadcrumbNav from "@/features/footprint/components/BreadcrumbNav.vue";
import FootprintMap from "@/features/footprint/components/FootprintMap.vue";
import { ensureMapRegistered } from "@/features/footprint/services/mapRuntime";
import { loadMapCatalog } from "@/features/footprint/services/mapCatalog";
import { useFootprintStore } from "@/features/footprint/state/useFootprintStore";
import type { MapCatalog, MapRegionFeature } from "@/shared/types/map";
import type { RegionLevel } from "@/shared/types/footprint";
import { getRegionDisplayName } from "@/shared/utils/regionDisplay";

interface PickerRegion {
  name: string;
  code: string;
}

const store = useFootprintStore();

const mapCatalog = ref<MapCatalog | null>(null);
const activeMapName = ref("");
const regions = ref<MapRegionFeature[]>([]);
const mapLoading = ref(false);
const mapError = ref<string | null>(null);
const mapStageRef = ref<HTMLElement | null>(null);

const picker = reactive({
  visible: false,
  x: 24,
  y: 24,
  region: null as PickerRegion | null,
});

let loadToken = 0;

const isProvinceView = computed(() => store.state.currentView.level === "province");
const isMapLoading = computed(() => mapLoading.value || store.loading.value);
const storeError = computed(() => store.error.value);

const currentProvinceName = computed(() => {
  if (store.state.currentView.level !== "province" || !mapCatalog.value) {
    return null;
  }

  const provinceName = mapCatalog.value.provinces[store.state.currentView.code]?.name ?? store.state.currentView.name ?? null;

  if (!provinceName) {
    return null;
  }

  return getRegionDisplayName(provinceName, store.state.currentView.code);
});

const markLevel = computed<RegionLevel>(() => (store.state.currentView.level === "country" ? "province" : "city"));
const markLevelLabel = computed(() => (markLevel.value === "province" ? "省级" : "市级"));

const currentRegionMarkColor = computed(() => {
  if (!picker.region) {
    return null;
  }

  const markKey = `${markLevel.value}:${picker.region.code}`;
  return store.state.marks[markKey]?.color ?? null;
});

const canDrillDown = computed(() => {
  if (!picker.region || store.state.currentView.level !== "country") {
    return false;
  }

  return Boolean(mapCatalog.value?.provinces[picker.region.code]);
});

function clampPickerPosition(rawX: number, rawY: number): { x: number; y: number } {
  const stage = mapStageRef.value;

  if (!stage) {
    return { x: rawX, y: rawY };
  }

  const pickerWidth = 240;
  const pickerHeight = 182;

  const x = Math.min(Math.max(rawX + 14, 12), Math.max(12, stage.clientWidth - pickerWidth));
  const y = Math.min(Math.max(rawY + 14, 12), Math.max(12, stage.clientHeight - pickerHeight));

  return { x, y };
}

function closePicker(): void {
  picker.visible = false;
  picker.region = null;
}

function openPicker(payload: { name: string; code: string; x: number; y: number }): void {
  const nextPos = clampPickerPosition(payload.x, payload.y);

  picker.region = {
    name: payload.name,
    code: payload.code,
  };
  picker.x = nextPos.x;
  picker.y = nextPos.y;
  picker.visible = true;
}

function applyMarkColor(color: string): void {
  if (!picker.region) {
    return;
  }

  store.setSelectedColor(color);
  store.setMark(
    {
      level: markLevel.value,
      code: picker.region.code,
      name: picker.region.name,
    },
    color
  );

  closePicker();
}

function clearCurrentRegionMark(): void {
  if (!picker.region) {
    return;
  }

  store.clearMark({
    level: markLevel.value,
    code: picker.region.code,
    name: picker.region.name,
  });
  closePicker();
}

function drillDownToProvince(): void {
  if (!picker.region || store.state.currentView.level !== "country") {
    return;
  }

  const province = mapCatalog.value?.provinces[picker.region.code];

  if (!province) {
    return;
  }

  store.setCurrentView({
    level: "province",
    code: province.code,
    name: province.name,
  });

  closePicker();
}

async function loadCurrentMap(): Promise<void> {
  if (!mapCatalog.value) {
    return;
  }

  const token = ++loadToken;
  mapError.value = null;
  mapLoading.value = true;

  try {
    if (store.state.currentView.level === "country") {
      const mapName = `country-${mapCatalog.value.country.code}`;
      const features = await ensureMapRegistered(mapName, mapCatalog.value.country.geoPath);

      if (token !== loadToken) {
        return;
      }

      activeMapName.value = mapName;
      regions.value = features;
      return;
    }

    if (store.state.currentView.level === "province") {
      const province = mapCatalog.value.provinces[store.state.currentView.code];

      if (!province) {
        store.resetCurrentViewToCountry();
        return;
      }

      const mapName = `province-${province.code}`;
      const features = await ensureMapRegistered(mapName, province.cityGeoPath);

      if (token !== loadToken) {
        return;
      }

      activeMapName.value = mapName;
      regions.value = features;
      return;
    }

    store.resetCurrentViewToCountry();
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : "地图加载失败";
    regions.value = [];
  } finally {
    mapLoading.value = false;
  }
}

function goCountryView(): void {
  store.resetCurrentViewToCountry();
}

function handleRegionClick(payload: { name: string; code: string; x: number; y: number }): void {
  openPicker(payload);
}

onMounted(async () => {
  try {
    await store.initialize();
    mapCatalog.value = await loadMapCatalog();
    await loadCurrentMap();
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : "地图初始化失败";
  }
});

watch(
  () => ({ ...store.state.currentView }),
  () => {
    closePicker();
    void loadCurrentMap();
  },
  { deep: true }
);
</script>

<style scoped>
.footprint-page {
  padding: 0;
}

.map-stage {
  position: relative;
  border: 0;
  border-radius: 0;
  background: #ffffff;
  overflow: hidden;
}

.map-floating-controls {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 10;
  pointer-events: none;
}

.map-nav-panel,
.status-alert {
  pointer-events: auto;
}

.map-nav-panel {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(150, 173, 194, 0.32);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
}

.status-alert {
  margin-top: 8px;
  max-width: min(520px, 94%);
}

.region-picker {
  position: absolute;
  z-index: 20;
  width: 240px;
  border-radius: 12px;
  border: 1px solid rgba(150, 173, 194, 0.5);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 36px rgba(149, 170, 191, 0.36);
  padding: 10px;
}

.picker-title {
  margin: 0;
  font-size: 0.94rem;
  font-weight: 600;
  color: #223547;
}

.picker-sub {
  margin: 3px 0 8px;
  font-size: 0.8rem;
  color: #6d8398;
}

.swatch-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(36, 58, 77, 0.16);
  cursor: pointer;
  transition: transform 150ms ease;
}

.swatch:hover {
  transform: translateY(-1px);
}

.swatch.is-selected {
  box-shadow: 0 0 0 2px rgba(77, 133, 191, 0.45);
}

.picker-meta {
  margin-top: 9px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: #667f95;
  font-size: 0.8rem;
}

.picker-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.picker-fade-enter-active,
.picker-fade-leave-active {
  transition: all 170ms ease;
}

.picker-fade-enter-from,
.picker-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (max-width: 900px) {
  .map-nav-panel {
    flex-wrap: wrap;
  }

  .region-picker {
    width: 214px;
  }
}
</style>
