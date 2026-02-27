export type RegionLevel = "country" | "province" | "city";

export interface RegionKey {
  level: RegionLevel;
  code: string;
  name?: string;
}

export interface VisitMark {
  region: RegionKey;
  color: string;
  updatedAt: string;
}

export interface FootprintStateV1 {
  version: 1;
  selectedColor: string;
  currentView: RegionKey;
  marks: Record<string, VisitMark>;
}

export type FootprintState = FootprintStateV1;

export const ROOT_REGION: RegionKey = {
  level: "country",
  code: "100000",
  name: "中国",
};
