import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { appConfig } from "@/app/config";

const mocks = vi.hoisted(() => {
  const zoomRef = { value: 2.1 };
  const onMock = vi.fn();
  const offMock = vi.fn();
  const disposeMock = vi.fn();
  const setOptionMock = vi.fn();
  const resizeMock = vi.fn();
  const getOptionMock = vi.fn(() => ({
    series: [{ zoom: zoomRef.value }],
  }));
  const initMock = vi.fn(() => ({
    on: onMock,
    off: offMock,
    dispose: disposeMock,
    setOption: setOptionMock,
    resize: resizeMock,
    getOption: getOptionMock,
  }));

  return {
    zoomRef,
    onMock,
    offMock,
    disposeMock,
    setOptionMock,
    resizeMock,
    getOptionMock,
    initMock,
  };
});

vi.mock("@/features/footprint/services/mapRuntime", () => ({
  echarts: {
    init: mocks.initMock,
  },
}));

import FootprintMap from "@/features/footprint/components/FootprintMap.vue";

describe("FootprintMap", () => {
  it("binds map click event and emits region payload", async () => {
    const wrapper = mount(FootprintMap, {
      props: {
        mapName: "country-100000",
        viewLevel: "country",
        loading: false,
        regions: [{ code: "110000", name: "北京市" }],
        marks: {
          "province:110000": {
            region: { level: "province", code: "110000", name: "北京市" },
            color: "#ec7063",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    });

    expect(mocks.initMock).toHaveBeenCalledTimes(1);
    expect(mocks.onMock).toHaveBeenCalledWith("click", expect.any(Function));
    expect(mocks.setOptionMock).toHaveBeenCalled();

    const clickHandler = mocks.onMock.mock.calls.find((call) => call[0] === "click")?.[1] as
      | ((payload: { name?: string; data?: { adcode?: string }; event?: { offsetX?: number; offsetY?: number } }) => void)
      | undefined;

    clickHandler?.({ name: "北京市", data: { adcode: "110000" }, event: { offsetX: 110, offsetY: 95 } });

    expect(wrapper.emitted("region-click")?.[0]).toEqual([{ name: "北京", code: "110000", x: 110, y: 95 }]);

    const option = mocks.setOptionMock.mock.calls[0]?.[0] as {
      series: [
        {
          layoutCenter: [string, string];
          layoutSize: string;
          data: Array<{ label?: { show?: boolean }; itemStyle?: { areaColor?: string } }>;
          label: { show: boolean };
          emphasis: { label: { show: boolean; formatter: (params: { name?: string; data?: { adcode?: string } }) => string } };
        },
      ];
    };
    expect(option.series[0].layoutCenter).toEqual([
      `${50 + appConfig.map.initialOffsetPercent.x}%`,
      `${50 + appConfig.map.initialOffsetPercent.y}%`,
    ]);
    expect(option.series[0].layoutSize).toBe("100%");
    expect(option.series[0].data[0].itemStyle?.areaColor).toBe("#ec7063");
    expect(option.series[0].data[0].label).toBeUndefined();

    const geoRoamHandler = mocks.onMock.mock.calls.find((call) => call[0] === "georoam")?.[1] as
      | (() => void)
      | undefined;
    const initialLabelVisible = option.series[0].label.show;
    mocks.zoomRef.value = initialLabelVisible ? 1 : 3;
    geoRoamHandler?.();

    expect(mocks.setOptionMock).toHaveBeenCalledTimes(2);

    const initialOption = mocks.setOptionMock.mock.calls[0]?.[0] as {
      series: [
        {
          label: { show: boolean; formatter: (params: { name?: string; data?: { adcode?: string } }) => string };
          emphasis: { label: { show: boolean; formatter: (params: { name?: string; data?: { adcode?: string } }) => string } };
        },
      ];
    };
    expect(initialOption.series[0].label.show).toBe(initialLabelVisible);
    expect(initialOption.series[0].label.formatter({ name: "河北省", data: { adcode: "130000" } })).toBe("河北省");
    expect(initialOption.series[0].emphasis.label.show).toBe(true);
    expect(initialOption.series[0].emphasis.label.formatter({ name: "北京市", data: { adcode: "110000" } })).toBe("北京");

    const zoomedOutUpdateOption = mocks.setOptionMock.mock.calls[1]?.[0] as {
      series: [{ id: string; label: { show: boolean } }];
    };
    expect(zoomedOutUpdateOption.series[0].id).toBe("footprint-map-series");
    expect(zoomedOutUpdateOption.series[0].label.show).toBe(!initialLabelVisible);
  });
});
