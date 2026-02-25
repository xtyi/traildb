<template>
  <section class="settings-page">
    <n-card class="settings-card" title="数据管理" size="small" embedded>
      <div class="row-actions">
        <n-button size="small" @click="downloadData">导出数据</n-button>
        <n-button size="small" type="error" ghost @click="resetData">清空本地数据</n-button>
      </div>

      <label class="field-label" for="strategy">导入冲突策略</label>
      <n-select
        id="strategy"
        v-model:value="conflictStrategy"
        :options="strategyOptions"
        size="small"
        class="select-input"
      />

      <label class="field-label" for="import-file">导入 JSON 文件</label>
      <input id="import-file" class="file-input" type="file" accept="application/json" @change="importData" />

      <n-alert v-if="message" type="success" :show-icon="false" class="feedback">{{ message }}</n-alert>
      <n-alert v-if="error" type="error" :show-icon="false" class="feedback">{{ error }}</n-alert>
    </n-card>

    <n-card class="settings-card" title="当前状态" size="small" embedded>
      <ul class="snapshot-list">
        <li><span>当前视图</span><strong>{{ store.state.currentView.level }} / {{ store.state.currentView.code }}</strong></li>
        <li><span>当前颜色</span><strong>{{ store.state.selectedColor }}</strong></li>
        <li><span>标记总数</span><strong>{{ markedCount }}</strong></li>
      </ul>
    </n-card>

    <n-card class="settings-card" title="后续扩展（预留）" size="small" embedded>
      <ul class="todo-list">
        <li>GitHub PAT 配置与最小权限校验</li>
        <li>仓库路径冲突检测与版本回滚</li>
        <li>跨设备同步策略（手动推送/拉取）</li>
      </ul>
    </n-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NAlert, NButton, NCard, NSelect } from "naive-ui";
import { useFootprintStore } from "@/features/footprint/state/useFootprintStore";

const store = useFootprintStore();

const conflictStrategy = ref<"merge" | "replace">("merge");
const strategyOptions = [
  { label: "合并（按 updatedAt 取较新）", value: "merge" },
  { label: "覆盖（直接替换当前全部数据）", value: "replace" },
];

const message = ref<string | null>(null);
const error = ref<string | null>(null);
const markedCount = computed(() => store.markedCount.value);

onMounted(async () => {
  await store.initialize();
});

function downloadData(): void {
  const payload = store.exportState();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = `traildb-${new Date().toISOString().slice(0, 10)}.json`;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);

  message.value = "数据已导出。";
  error.value = null;
}

async function importData(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  message.value = null;
  error.value = null;

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText) as unknown;

    const success = conflictStrategy.value === "merge" ? store.mergeState(parsed) : store.importState(parsed);

    if (!success) {
      error.value = "导入失败：文件不符合 FootprintStateV1 结构。";
      return;
    }

    message.value = conflictStrategy.value === "merge" ? "导入成功，已按策略合并。" : "导入成功，已覆盖当前数据。";
  } catch (importError) {
    error.value = importError instanceof Error ? `导入失败：${importError.message}` : "导入失败";
  } finally {
    input.value = "";
  }
}

async function resetData(): Promise<void> {
  if (!window.confirm("确定清空本地足迹数据吗？该操作不可撤销。")) {
    return;
  }

  await store.clearPersistedFootprintData();
  message.value = "本地数据已清空并重置默认状态。";
  error.value = null;
}
</script>

<style scoped>
.settings-page {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
}

.settings-card {
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(150, 173, 194, 0.45);
}

.row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.field-label {
  margin-top: 12px;
  display: block;
  color: var(--ink-soft);
  font-size: 0.84rem;
}

.select-input,
.file-input {
  margin-top: 6px;
  width: 100%;
}

.file-input {
  color: #5f768d;
}

.feedback {
  margin-top: 10px;
}

.snapshot-list,
.todo-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
}

.snapshot-list {
  list-style: none;
  padding-left: 0;
}

.snapshot-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.9rem;
}

.snapshot-list strong {
  color: #2f7ddf;
}

@media (max-width: 980px) {
  .settings-page {
    grid-template-columns: 1fr;
  }
}
</style>
