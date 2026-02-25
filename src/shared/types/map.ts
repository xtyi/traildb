export interface ProvinceMapEntry {
  code: string;
  name: string;
  parentCode: string;
  geoPath: string;
  cityGeoPath: string;
}

export interface CountryMapEntry {
  code: string;
  name: string;
  geoPath: string;
}

export interface MapCatalog {
  version: 1;
  country: CountryMapEntry;
  provinces: Record<string, ProvinceMapEntry>;
}

export interface MapRegionFeature {
  code: string;
  name: string;
}
