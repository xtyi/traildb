import { beforeEach, describe, expect, it } from "vitest";
import { useFootprintStore } from "@/features/footprint/state/useFootprintStore";

const store = useFootprintStore();

describe("useFootprintStore", () => {
  beforeEach(() => {
    store.clearAllMarks();
    store.setSelectedColor("#ec7063");
    store.resetCurrentViewToCountry();
  });

  it("toggles mark with selected color", () => {
    store.toggleMark({ level: "province", code: "110000", name: "北京市" });
    expect(store.markedCount.value).toBe(1);

    store.toggleMark({ level: "province", code: "110000", name: "北京市" });
    expect(store.markedCount.value).toBe(0);
  });

  it("updates mark color when selected color changes", () => {
    store.toggleMark({ level: "province", code: "310000", name: "上海市" });
    store.setSelectedColor("#3db9a4");
    store.toggleMark({ level: "province", code: "310000", name: "上海市" });

    const mark = store.getMark({ level: "province", code: "310000" });

    expect(mark?.color).toBe("#3db9a4");
    expect(store.markedCount.value).toBe(1);
  });

  it("merges imported marks using updatedAt", () => {
    store.toggleMark({ level: "province", code: "440000", name: "广东省" });

    const merged = store.mergeState({
      version: 1,
      selectedColor: "#ec7063",
      currentView: {
        level: "country",
        code: "100000",
      },
      marks: {
        "province:440000": {
          region: {
            level: "province",
            code: "440000",
            name: "广东省",
          },
          color: "#52a7d7",
          updatedAt: "2999-01-01T00:00:00.000Z",
        },
      },
    });

    expect(merged).toBe(true);
    expect(store.getMark({ level: "province", code: "440000" })?.color).toBe("#52a7d7");
  });

  it("rejects invalid imported payload", () => {
    const accepted = store.importState({
      version: 1,
      selectedColor: "bad-color",
      currentView: { level: "country", code: "100000" },
      marks: {},
    });

    expect(accepted).toBe(false);
  });
});
