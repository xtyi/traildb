import { describe, expect, it } from "vitest";
import { migrateFootprintState, parseFootprintStateV1 } from "@/shared/utils/stateSchema";

describe("stateSchema", () => {
  it("parses valid v1 state", () => {
    const input = {
      version: 1,
      selectedColor: "#ec7063",
      currentView: {
        level: "country",
        code: "100000",
      },
      marks: {
        "province:110000": {
          region: {
            level: "province",
            code: "110000",
            name: "北京市",
          },
          color: "#ec7063",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };

    const parsed = parseFootprintStateV1(input);

    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(1);
    expect(parsed?.marks["province:110000"]?.region.code).toBe("110000");
  });

  it("rejects invalid color", () => {
    const input = {
      version: 1,
      selectedColor: "red",
      currentView: { level: "country", code: "100000" },
      marks: {},
    };

    expect(parseFootprintStateV1(input)).toBeNull();
  });

  it("migrates known state only", () => {
    const input = {
      version: 1,
      selectedColor: "#ec7063",
      currentView: {
        level: "country",
        code: "100000",
      },
      marks: {},
    };

    expect(migrateFootprintState(input)).not.toBeNull();
    expect(migrateFootprintState({ version: 0 })).toBeNull();
  });
});
