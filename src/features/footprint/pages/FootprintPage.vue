<template>
  <section class="footprint-page">
    <div ref="mapStageRef" class="map-stage">
      <div class="map-floating-controls">
        <div class="map-nav-panel">
          <div class="view-switch">
            <n-button
              size="small"
              :type="mapMode === 'province' ? 'primary' : 'default'"
              :secondary="mapMode !== 'province'"
              @click="switchMapMode('province')"
            >
              省级地图
            </n-button>
            <n-button
              size="small"
              :type="mapMode === 'city' ? 'primary' : 'default'"
              :secondary="mapMode !== 'city'"
              @click="switchMapMode('city')"
            >
              市级地图
            </n-button>
          </div>
        </div>

        <n-alert v-if="mapError" type="error" :show-icon="false" class="status-alert">{{ mapError }}</n-alert>
        <n-alert v-else-if="storeError" type="error" :show-icon="false" class="status-alert">{{ storeError }}</n-alert>
      </div>

      <FootprintMap
        :map-name="activeMapName"
        :province-boundary-map-name="provinceBoundaryMapName"
        :regions="regions"
        :marks="store.state.marks"
        :view-level="mapViewLevel"
        :focus-request="mapFocusRequest"
        :hide-base-labels-by-default="mapMode === 'city'"
        :loading="isMapLoading"
        @region-click="handleRegionClick"
      />

      <transition name="search-fade">
        <div v-if="search.visible" class="search-layer" @mousedown.self="closeSearch">
          <div class="search-panel">
            <div class="search-header">
              <input
                ref="searchInputRef"
                v-model="search.query"
                class="search-input"
                type="text"
                placeholder="搜索省级或市级地区（Enter 跳转）"
                @keydown="handleSearchInputKeydown"
              />
              <span class="search-shortcut">Esc</span>
            </div>

            <p class="search-tip">按 Ctrl+P 可再次唤出搜索</p>

            <div v-if="search.loading" class="search-empty">正在加载地区索引...</div>
            <div v-else-if="search.error" class="search-empty is-error">{{ search.error }}</div>
            <ul v-else-if="filteredSearchEntries.length > 0" class="search-results">
              <li v-for="(entry, index) in filteredSearchEntries" :key="`${entry.level}:${entry.code}`">
                <button
                  type="button"
                  class="search-result-item"
                  :class="{ 'is-active': index === search.activeIndex }"
                  @mouseenter="search.activeIndex = index"
                  @click="selectSearchEntry(entry)"
                >
                  <span class="result-name">{{ entry.displayName }}</span>
                  <span class="result-meta">
                    {{ entry.level === "province" ? "省级" : "市级" }}
                    <template v-if="entry.level === 'city' && entry.provinceDisplayName">
                      · {{ entry.provinceDisplayName }}
                    </template>
                  </span>
                </button>
              </li>
            </ul>
            <div v-else class="search-empty">没有匹配到相关地区</div>
          </div>
        </div>
      </transition>

      <transition name="picker-fade">
        <div
          v-if="picker.visible && picker.region"
          ref="pickerRef"
          class="region-picker"
          :style="{ left: `${picker.x}px`, top: `${picker.y}px` }"
        >
          <div class="swatch-grid">
            <button
              type="button"
              class="swatch swatch-clear"
              aria-label="清除标记"
              @click="clearCurrentRegionMark"
            >
              <svg viewBox="0 0 24 24" class="clear-icon" aria-hidden="true">
                <path d="M3.8 14.4L12.6 5.6a2.1 2.1 0 0 1 3 0l4.8 4.8a2.1 2.1 0 0 1 0 3l-6.1 6.1H8.6z" />
                <path d="M8.2 19.5h11.4" />
              </svg>
            </button>
            <button
              v-for="(color, index) in paletteColors"
              :key="`${color}-${index}`"
              type="button"
              class="swatch"
              :class="{ 'is-selected': currentRegionMarkColor === color }"
              :style="{ background: color }"
              @click="applyMarkColor(color)"
              @contextmenu.prevent="openSwatchEditor(index, $event)"
            />
          </div>

          <div
            v-if="swatchEditor.visible"
            class="swatch-editor"
            :style="{ left: `${swatchEditor.x}px`, top: `${swatchEditor.y}px` }"
          >
            <n-color-picker
              v-model:value="swatchEditor.color"
              :show-alpha="false"
              :modes="['hex']"
              :swatches="paletteColors"
              :actions="['confirm']"
            />
            <div class="custom-color-actions">
              <n-button size="tiny" secondary @click="closeSwatchEditor">取消</n-button>
              <n-button size="tiny" type="primary" @click="applySwatchEdit">应用</n-button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { NAlert, NButton, NColorPicker } from "naive-ui";
import FootprintMap from "@/features/footprint/components/FootprintMap.vue";
import { appConfig } from "@/app/config";
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

type MapMode = "province" | "city";
type SearchEntryLevel = "province" | "city";

interface SearchEntry {
  level: SearchEntryLevel;
  code: string;
  name: string;
  displayName: string;
  provinceDisplayName: string | null;
  center?: [number, number];
  keywords: string;
}

interface PendingSearchFocus {
  level: SearchEntryLevel;
  code: string;
  center?: [number, number];
}

interface MapFocusRequest {
  token: number;
  code: string;
  center?: [number, number];
  zoom?: number;
  durationMs: number;
}

const store = useFootprintStore();
const SHOW_CITY_PROVINCE_BOUNDARY = appConfig.map.showCityProvinceBoundary;
const SEARCH_RESULT_LIMIT = 16;
const SEARCH_FOCUS_DURATION_MS = 5000;
const SEARCH_CITY_ZOOM = 4;

const mapCatalog = ref<MapCatalog | null>(null);
const mapMode = ref<MapMode>("province");
const activeMapName = ref("");
const provinceBoundaryMapName = ref<string | null>(null);
const regions = ref<MapRegionFeature[]>([]);
const mapLoading = ref(false);
const mapError = ref<string | null>(null);
const mapStageRef = ref<HTMLElement | null>(null);
const pickerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const picker = reactive({
  visible: false,
  x: 24,
  y: 24,
  region: null as PickerRegion | null,
});
const paletteColors = ref([...store.palette]);
const swatchEditor = reactive({
  visible: false,
  index: -1,
  x: 8,
  y: 44,
  color: store.state.selectedColor,
});
const search = reactive({
  visible: false,
  query: "",
  loading: false,
  error: null as string | null,
  activeIndex: 0,
});
const searchEntries = ref<SearchEntry[]>([]);
const pendingSearchFocus = ref<PendingSearchFocus | null>(null);
const mapFocusRequest = ref<MapFocusRequest | null>(null);

let loadToken = 0;
let mapFocusToken = 0;

const mapViewLevel = computed<RegionLevel>(() => (mapMode.value === "province" ? "country" : "province"));
const isMapLoading = computed(() => mapLoading.value || store.loading.value);
const storeError = computed(() => store.error.value);
const markLevel = computed<RegionLevel>(() => (mapMode.value === "province" ? "province" : "city"));

const currentRegionMarkColor = computed(() => {
  if (!picker.region) {
    return null;
  }

  const markKey = `${markLevel.value}:${picker.region.code}`;
  return store.state.marks[markKey]?.color ?? null;
});

function normalizeSearchText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/特别行政区/g, "")
    .replace(/维吾尔自治区|壮族自治区|回族自治区|自治区/g, "")
    .replace(/省|市|地区|盟/g, "");
}

function buildSearchKeywords(parts: Array<string | undefined>): string {
  const bucket = new Set<string>();

  for (const item of parts) {
    if (!item) {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    bucket.add(trimmed.toLowerCase());
    bucket.add(normalizeSearchText(trimmed));
  }

  return Array.from(bucket).join("|");
}

const filteredSearchEntries = computed(() => {
  const query = search.query.trim();
  const allEntries = searchEntries.value;

  if (!query) {
    return allEntries.slice(0, SEARCH_RESULT_LIMIT);
  }

  const normalizedQuery = normalizeSearchText(query);

  return allEntries
    .filter((entry) => entry.keywords.includes(query.toLowerCase()) || entry.keywords.includes(normalizedQuery))
    .slice(0, SEARCH_RESULT_LIMIT);
});

function switchMapMode(nextMode: MapMode): void {
  if (mapMode.value === nextMode) {
    return;
  }

  mapMode.value = nextMode;
}

async function ensureSearchEntriesLoaded(): Promise<void> {
  if (searchEntries.value.length > 0 || search.loading || !mapCatalog.value) {
    return;
  }

  search.loading = true;
  search.error = null;

  try {
    const catalog = mapCatalog.value;
    const provinces = Object.values(catalog.provinces).map((province) => {
      const displayName = getRegionDisplayName(province.name, province.code);
      return {
        level: "province" as const,
        code: province.code,
        name: province.name,
        displayName,
        provinceDisplayName: null,
        keywords: buildSearchKeywords([province.code, province.name, displayName]),
      };
    });

    const cityMapName = `city-${catalog.city.code}`;
    const cityRegions = await ensureMapRegistered(cityMapName, catalog.city.geoPath);
    const cities = cityRegions.map((region) => {
      const provinceCode = `${region.code.slice(0, 2)}0000`;
      const provinceName = catalog.provinces[provinceCode]?.name ?? "";
      const provinceDisplayName = provinceName ? getRegionDisplayName(provinceName, provinceCode) : "";
      const displayName = getRegionDisplayName(region.name, region.code);

      return {
        level: "city" as const,
        code: region.code,
        name: region.name,
        displayName,
        provinceDisplayName: provinceDisplayName || null,
        center: region.center,
        keywords: buildSearchKeywords([region.code, region.name, displayName, provinceName, provinceDisplayName]),
      };
    });

    searchEntries.value = [...provinces, ...cities];
  } catch (error) {
    search.error = error instanceof Error ? error.message : "地区索引加载失败";
  } finally {
    search.loading = false;
  }
}

async function openSearch(): Promise<void> {
  closePicker();
  search.visible = true;
  search.query = "";
  search.activeIndex = 0;
  await ensureSearchEntriesLoaded();
  await nextTick();
  searchInputRef.value?.focus();
}

function closeSearch(): void {
  search.visible = false;
  search.activeIndex = 0;
}

function selectSearchEntry(entry: SearchEntry): void {
  pendingSearchFocus.value = {
    level: entry.level,
    code: entry.code,
    center: entry.center,
  };

  closeSearch();
  mapMode.value = entry.level === "province" ? "province" : "city";
  applyPendingSearchFocus();
}

function triggerMapFocus(target: PendingSearchFocus): void {
  const baseRequest: MapFocusRequest = {
    token: ++mapFocusToken,
    code: target.code,
    durationMs: SEARCH_FOCUS_DURATION_MS,
  };

  if (target.level === "city") {
    const matchedRegion = regions.value.find((region) => region.code === target.code);
    const center = target.center ?? matchedRegion?.center;

    if (center) {
      baseRequest.center = center;
    }
    baseRequest.zoom = SEARCH_CITY_ZOOM;
  }

  mapFocusRequest.value = baseRequest;
}

function applyPendingSearchFocus(): void {
  const pendingTarget = pendingSearchFocus.value;
  if (!pendingTarget) {
    return;
  }

  const expectedMode: MapMode = pendingTarget.level === "province" ? "province" : "city";
  if (mapMode.value !== expectedMode) {
    return;
  }

  const existsInCurrentMap = regions.value.some((region) => region.code === pendingTarget.code);
  if (!existsInCurrentMap) {
    return;
  }

  triggerMapFocus(pendingTarget);
  pendingSearchFocus.value = null;
}

function handleSearchInputKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();

    if (filteredSearchEntries.value.length > 0) {
      search.activeIndex = (search.activeIndex + 1) % filteredSearchEntries.value.length;
    }
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();

    if (filteredSearchEntries.value.length > 0) {
      search.activeIndex =
        (search.activeIndex - 1 + filteredSearchEntries.value.length) % filteredSearchEntries.value.length;
    }
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const activeEntry = filteredSearchEntries.value[search.activeIndex] ?? filteredSearchEntries.value[0];

    if (activeEntry) {
      selectSearchEntry(activeEntry);
    }
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeSearch();
  }
}

function clampPickerPosition(rawX: number, rawY: number): { x: number; y: number } {
  const stage = mapStageRef.value;

  if (!stage) {
    return { x: rawX, y: rawY };
  }

  const pickerWidth = 252;
  const pickerHeight = 76;

  const x = Math.min(Math.max(rawX + 14, 12), Math.max(12, stage.clientWidth - pickerWidth));
  const y = Math.min(Math.max(rawY + 14, 12), Math.max(12, stage.clientHeight - pickerHeight));

  return { x, y };
}

function closePicker(): void {
  picker.visible = false;
  picker.region = null;
  closeSwatchEditor();
}

function closeSwatchEditor(): void {
  swatchEditor.visible = false;
  swatchEditor.index = -1;
}

function clampSwatchEditorPosition(clientX: number, clientY: number): { x: number; y: number } {
  const pickerEl = pickerRef.value;

  if (!pickerEl) {
    return { x: 8, y: 44 };
  }

  const panelWidth = 222;
  const panelHeight = 252;
  const padding = 8;
  const topOffset = 40;
  const rect = pickerEl.getBoundingClientRect();
  const rawX = clientX - rect.left + 10;
  const rawY = clientY - rect.top + 10;

  const x = Math.min(Math.max(rawX, padding), Math.max(padding, rect.width - panelWidth - padding));
  const y = Math.min(Math.max(rawY, topOffset), Math.max(topOffset, rect.height - panelHeight - padding));

  return { x, y };
}

function openSwatchEditor(index: number, event: MouseEvent): void {
  if (index < 0 || index >= paletteColors.value.length) {
    return;
  }

  const nextPos = clampSwatchEditorPosition(event.clientX, event.clientY);
  swatchEditor.index = index;
  swatchEditor.color = paletteColors.value[index];
  swatchEditor.x = nextPos.x;
  swatchEditor.y = nextPos.y;
  swatchEditor.visible = true;
}

function applySwatchEdit(): void {
  if (swatchEditor.index < 0 || swatchEditor.index >= paletteColors.value.length) {
    return;
  }

  const nextColor = swatchEditor.color;
  const previousColor = paletteColors.value[swatchEditor.index];
  paletteColors.value.splice(swatchEditor.index, 1, nextColor);

  if (store.state.selectedColor === previousColor) {
    store.setSelectedColor(nextColor);
  }

  closeSwatchEditor();
}

function handleGlobalPointerDown(event: PointerEvent): void {
  if (!picker.visible) {
    return;
  }

  const target = event.target;

  if (!(target instanceof Node)) {
    return;
  }

  if (pickerRef.value?.contains(target)) {
    return;
  }

  closePicker();
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p";

  if (isSearchShortcut) {
    event.preventDefault();

    if (search.visible) {
      closeSearch();
    } else {
      void openSearch();
    }
    return;
  }

  if (search.visible && event.key === "Escape") {
    event.preventDefault();
    closeSearch();
  }
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
  closeSwatchEditor();
}

function applyMarkColor(color: string): void {
  if (!picker.region) {
    return;
  }

  store.setSelectedColor(color);
  if (markLevel.value === "city") {
    store.setCityMarkWithProvinceSync(
      {
        level: "city",
        code: picker.region.code,
        name: picker.region.name,
      },
      color
    );
  } else {
    store.setMark(
      {
        level: "province",
        code: picker.region.code,
        name: picker.region.name,
      },
      color
    );
  }

  closePicker();
}

function clearCurrentRegionMark(): void {
  if (!picker.region) {
    return;
  }

  if (markLevel.value === "province") {
    store.clearProvinceMarkWithCities({
      level: "province",
      code: picker.region.code,
      name: picker.region.name,
    });
  } else {
    store.clearMark({
      level: "city",
      code: picker.region.code,
      name: picker.region.name,
    });
  }
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
    if (mapMode.value === "province") {
      const mapName = `country-${mapCatalog.value.country.code}`;
      const features = await ensureMapRegistered(mapName, mapCatalog.value.country.geoPath);

      if (token !== loadToken) {
        return;
      }

      activeMapName.value = mapName;
      provinceBoundaryMapName.value = null;
      regions.value = features;
      applyPendingSearchFocus();
      return;
    }

    const mapName = `city-${mapCatalog.value.city.code}`;
    const features = await ensureMapRegistered(mapName, mapCatalog.value.city.geoPath);

    if (SHOW_CITY_PROVINCE_BOUNDARY) {
      const boundaryMapName = `boundary-${mapCatalog.value.provinceBoundary.code}`;
      await ensureMapRegistered(boundaryMapName, mapCatalog.value.provinceBoundary.geoPath);

      if (token !== loadToken) {
        return;
      }

      activeMapName.value = mapName;
      provinceBoundaryMapName.value = boundaryMapName;
      regions.value = features;
      applyPendingSearchFocus();
      return;
    }

    if (token !== loadToken) {
      return;
    }

    activeMapName.value = mapName;
    provinceBoundaryMapName.value = null;
    regions.value = features;
    applyPendingSearchFocus();
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : "地图加载失败";
    provinceBoundaryMapName.value = null;
    regions.value = [];
  } finally {
    mapLoading.value = false;
  }
}

function handleRegionClick(payload: { name: string; code: string; x: number; y: number }): void {
  openPicker(payload);
}

onMounted(async () => {
  window.addEventListener("pointerdown", handleGlobalPointerDown);
  window.addEventListener("keydown", handleGlobalKeyDown);

  try {
    await store.initialize();
    mapCatalog.value = await loadMapCatalog();
    await loadCurrentMap();
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : "地图初始化失败";
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleGlobalPointerDown);
  window.removeEventListener("keydown", handleGlobalKeyDown);
});

watch(mapMode, () => {
  closePicker();
  closeSearch();
  void loadCurrentMap();
});

watch(
  () => search.query,
  () => {
    search.activeIndex = 0;
  }
);

watch(
  () => filteredSearchEntries.value.length,
  (size) => {
    if (size === 0) {
      search.activeIndex = 0;
      return;
    }

    if (search.activeIndex >= size) {
      search.activeIndex = 0;
    }
  }
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

.view-switch {
  display: inline-flex;
  gap: 8px;
}

.status-alert {
  margin-top: 8px;
  max-width: min(520px, 94%);
}

.search-layer {
  position: absolute;
  inset: 0;
  z-index: 24;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 56px;
  background: rgba(250, 252, 255, 0.28);
}

.search-panel {
  width: min(560px, calc(100% - 24px));
  border-radius: 14px;
  border: 1px solid rgba(137, 163, 185, 0.48);
  background: rgba(255, 255, 255, 0.97);
  box-shadow:
    0 20px 42px rgba(116, 142, 166, 0.24),
    0 6px 14px rgba(116, 142, 166, 0.12);
  backdrop-filter: blur(10px);
  padding: 12px;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  width: 100%;
  height: 40px;
  border: 1px solid rgba(136, 161, 183, 0.6);
  border-radius: 10px;
  background: #fbfdff;
  padding: 0 12px;
  font-size: 0.95rem;
  color: #213548;
  outline: none;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.search-input:focus {
  border-color: rgba(74, 131, 186, 0.78);
  box-shadow: 0 0 0 2px rgba(74, 131, 186, 0.16);
}

.search-shortcut {
  min-width: 36px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(145, 169, 190, 0.62);
  color: #5f7991;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
}

.search-tip {
  margin: 8px 0 0;
  color: #6c849a;
  font-size: 0.78rem;
}

.search-results {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
  max-height: 340px;
  overflow-y: auto;
}

.search-result-item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  background: #f7fbff;
  padding: 9px 10px;
  text-align: left;
  display: grid;
  gap: 3px;
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease;
}

.search-result-item:hover,
.search-result-item.is-active {
  border-color: rgba(74, 131, 186, 0.58);
  background: #eef5ff;
}

.result-name {
  font-size: 0.92rem;
  color: #1f3346;
  font-weight: 600;
}

.result-meta {
  font-size: 0.78rem;
  color: #698198;
}

.search-empty {
  margin-top: 10px;
  border-radius: 10px;
  background: #f6f9fc;
  border: 1px solid rgba(157, 178, 198, 0.45);
  color: #6c849a;
  font-size: 0.84rem;
  padding: 10px;
}

.search-empty.is-error {
  color: #b74b5b;
  border-color: rgba(209, 104, 121, 0.38);
  background: #fff4f6;
}

.region-picker {
  position: absolute;
  z-index: 20;
  width: fit-content;
  max-width: 340px;
  border-radius: 14px;
  border: 1px solid rgba(137, 163, 185, 0.45);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 249, 255, 0.96) 100%);
  box-shadow:
    0 16px 34px rgba(116, 142, 166, 0.24),
    0 4px 10px rgba(116, 142, 166, 0.14);
  backdrop-filter: blur(10px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.swatch-grid {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  padding-top: 4px;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.swatch {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 4px;
  border: 1px solid rgba(36, 58, 77, 0.24);
  cursor: pointer;
  transition: border-color 150ms ease, outline-color 150ms ease;
}

.swatch:hover {
  border-color: rgba(31, 54, 74, 0.52);
}

.swatch.is-selected {
  border-color: rgba(40, 88, 130, 0.78);
  outline: 2px solid rgba(89, 149, 211, 0.5);
  outline-offset: 1px;
}

.swatch-clear {
  background:
    linear-gradient(45deg, #e4e7ec 25%, transparent 25%),
    linear-gradient(-45deg, #e4e7ec 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e4e7ec 75%),
    linear-gradient(-45deg, transparent 75%, #e4e7ec 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  background-color: #f7f8fa;
  color: #2d4b63;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.swatch-clear:hover {
  color: #1b3448;
}

.clear-icon {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.swatch-editor {
  position: absolute;
  z-index: 26;
  width: 222px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(137, 163, 185, 0.58);
  background: rgba(252, 254, 255, 0.98);
  box-shadow:
    0 12px 26px rgba(116, 142, 166, 0.2),
    0 2px 8px rgba(116, 142, 166, 0.12);
}

.custom-color-actions {
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

.search-fade-enter-active,
.search-fade-leave-active {
  transition: opacity 150ms ease;
}

.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .map-nav-panel {
    flex-wrap: wrap;
  }

  .search-layer {
    padding-top: 46px;
  }

  .search-panel {
    width: calc(100% - 16px);
  }

  .region-picker {
    width: 226px;
  }
}
</style>
