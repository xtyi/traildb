import { computed, reactive, ref, watch } from "vue";
import { appConfig } from "@/app/config";
import { localStorageAdapter } from "@/services/storage/localStorageAdapter";
import type { StorageAdapter } from "@/services/storage/storageAdapter";
import { ROOT_REGION, type FootprintStateV1, type RegionKey, type VisitMark } from "@/shared/types/footprint";
import { makeRegionMarkKey } from "@/shared/utils/region";
import { migrateFootprintState } from "@/shared/utils/stateSchema";

const STORAGE_DEBOUNCE_MS = 300;
const DEFAULT_PALETTE = [...appConfig.footprint.palette];

function toProvinceCode(code: string): string {
  const prefix = code.slice(0, 2);
  if (prefix.length < 2) {
    return code;
  }

  return `${prefix}0000`;
}

function cityCodeBelongsToProvince(cityCode: string, provinceCode: string): boolean {
  return cityCode.slice(0, 2) === provinceCode.slice(0, 2);
}

function createDefaultState(): FootprintStateV1 {
  return {
    version: 1,
    selectedColor: DEFAULT_PALETTE[0] ?? "#ec7063",
    currentView: { ...ROOT_REGION },
    marks: {},
  };
}

const state = reactive<FootprintStateV1>(createDefaultState());
const ready = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

let activeAdapter: StorageAdapter = localStorageAdapter;
let initialized = false;
let watcherBound = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function replaceState(nextState: FootprintStateV1): void {
  state.version = nextState.version;
  state.selectedColor = nextState.selectedColor;
  state.currentView = { ...nextState.currentView };
  state.marks = { ...nextState.marks };
}

function createStateSnapshot(): FootprintStateV1 {
  const marks: Record<string, VisitMark> = {};

  for (const [key, mark] of Object.entries(state.marks)) {
    marks[key] = {
      region: {
        level: mark.region.level,
        code: mark.region.code,
        name: mark.region.name,
      },
      color: mark.color,
      updatedAt: mark.updatedAt,
    };
  }

  return {
    version: state.version,
    selectedColor: state.selectedColor,
    currentView: {
      level: state.currentView.level,
      code: state.currentView.code,
      name: state.currentView.name,
    },
    marks,
  };
}

async function persistStateNow(): Promise<void> {
  try {
    await activeAdapter.save(createStateSnapshot());
    error.value = null;
  } catch (persistError) {
    error.value = persistError instanceof Error ? persistError.message : "保存本地数据失败";
  }
}

function schedulePersist(): void {
  if (!ready.value) {
    return;
  }

  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    void persistStateNow();
    persistTimer = null;
  }, STORAGE_DEBOUNCE_MS);
}

function bindWatcherOnce(): void {
  if (watcherBound) {
    return;
  }

  watcherBound = true;

  watch(
    () => ({
      selectedColor: state.selectedColor,
      currentView: state.currentView,
      marks: state.marks,
    }),
    () => {
      schedulePersist();
    },
    { deep: true }
  );
}

export async function initializeFootprintStore(adapter: StorageAdapter = localStorageAdapter): Promise<void> {
  if (initialized) {
    return;
  }

  initialized = true;
  activeAdapter = adapter;
  loading.value = true;
  error.value = null;

  bindWatcherOnce();

  try {
    const loaded = await activeAdapter.load();

    if (loaded) {
      replaceState(loaded);
    }
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : "加载本地数据失败";
  } finally {
    loading.value = false;
    ready.value = true;
  }
}

export function setSelectedColor(color: string): void {
  state.selectedColor = color;
}

export function setCurrentView(region: RegionKey): void {
  state.currentView = { ...region };
}

export function resetCurrentViewToCountry(): void {
  state.currentView = { ...ROOT_REGION };
}

export function setMark(region: RegionKey, color = state.selectedColor): void {
  const key = makeRegionMarkKey(region);

  state.marks[key] = {
    region: { ...region },
    color,
    updatedAt: new Date().toISOString(),
  };
}

export function clearMark(region: RegionKey): void {
  const key = makeRegionMarkKey(region);
  delete state.marks[key];
}

export function clearProvinceMarkWithCities(region: RegionKey): void {
  const provinceCode = toProvinceCode(region.code);
  delete state.marks[`province:${provinceCode}`];

  for (const key of Object.keys(state.marks)) {
    if (!key.startsWith("city:")) {
      continue;
    }

    const cityCode = key.slice("city:".length);

    if (cityCodeBelongsToProvince(cityCode, provinceCode)) {
      delete state.marks[key];
    }
  }
}

export function toggleMark(region: RegionKey): void {
  const key = makeRegionMarkKey(region);
  const existing = state.marks[key];

  if (existing && existing.color === state.selectedColor) {
    delete state.marks[key];
    return;
  }

  state.marks[key] = {
    region: { ...region },
    color: state.selectedColor,
    updatedAt: new Date().toISOString(),
  };
}

export function getMark(region: RegionKey): VisitMark | undefined {
  return state.marks[makeRegionMarkKey(region)];
}

export function setCityMarkWithProvinceSync(
  cityRegion: RegionKey,
  cityColor = state.selectedColor
): void {
  const cityCode = cityRegion.code;
  const provinceCode = toProvinceCode(cityCode);
  const now = new Date().toISOString();

  state.marks[`city:${cityCode}`] = {
    region: {
      ...cityRegion,
      level: "city",
    },
    color: cityColor,
    updatedAt: now,
  };

  const provinceKey = `province:${provinceCode}`;
  state.marks[provinceKey] = {
    region: {
      level: "province",
      code: provinceCode,
    },
    color: cityColor,
    updatedAt: now,
  };
}

export function clearAllMarks(): void {
  state.marks = {};
}

export async function clearPersistedFootprintData(): Promise<void> {
  await activeAdapter.clear();
  replaceState(createDefaultState());
}

export function importState(rawInput: unknown): boolean {
  const next = migrateFootprintState(rawInput);

  if (!next) {
    return false;
  }

  replaceState(next);
  void persistStateNow();
  return true;
}

export function mergeState(rawInput: unknown): boolean {
  const incoming = migrateFootprintState(rawInput);

  if (!incoming) {
    return false;
  }

  const mergedMarks = { ...state.marks };

  for (const [key, incomingMark] of Object.entries(incoming.marks)) {
    const current = mergedMarks[key];

    if (!current || incomingMark.updatedAt > current.updatedAt) {
      mergedMarks[key] = incomingMark;
    }
  }

  state.marks = mergedMarks;
  void persistStateNow();
  return true;
}

export function exportState(): FootprintStateV1 {
  return createStateSnapshot();
}

export function useFootprintStore() {
  return {
    state,
    ready: computed(() => ready.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    palette: DEFAULT_PALETTE,
    markedCount: computed(() => Object.keys(state.marks).length),
    initialize: initializeFootprintStore,
    setSelectedColor,
    setCurrentView,
    resetCurrentViewToCountry,
    setMark,
    setCityMarkWithProvinceSync,
    clearMark,
    clearProvinceMarkWithCities,
    toggleMark,
    getMark,
    clearAllMarks,
    clearPersistedFootprintData,
    importState,
    mergeState,
    exportState,
  };
}
