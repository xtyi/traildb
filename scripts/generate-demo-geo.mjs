import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const GEO_ROOT = resolve(root, "public", "geo");
const COUNTRY_DIR = resolve(GEO_ROOT, "country");
const PROVINCE_DIR = resolve(GEO_ROOT, "province");
const CITY_DIR = resolve(GEO_ROOT, "city");

const BOUNDARY_BASE_URL = "https://geo.datav.aliyun.com/areas_v3/bound";

function normalizeCode(input) {
  const value = String(input ?? "").trim();
  return /^\d{6}$/.test(value) ? value : null;
}

async function fetchJson(relativePath) {
  const url = `${BOUNDARY_BASE_URL}/${relativePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchProvinceCityGeoJson(code) {
  const candidates = [`${code}_full.json`, `${code}.json`];

  for (const candidate of candidates) {
    try {
      const data = await fetchJson(candidate);
      ensureFeatureCollection(data, `province ${code}`);
      return data;
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`No available boundary file for province ${code}`);
}

function ensureFeatureCollection(input, label) {
  if (!input || input.type !== "FeatureCollection" || !Array.isArray(input.features)) {
    throw new Error(`${label} is not a valid GeoJSON FeatureCollection`);
  }
}

function recreateGeoDirectories() {
  rmSync(GEO_ROOT, { recursive: true, force: true });
  mkdirSync(COUNTRY_DIR, { recursive: true });
  mkdirSync(PROVINCE_DIR, { recursive: true });
  mkdirSync(CITY_DIR, { recursive: true });
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value));
}

async function main() {
  recreateGeoDirectories();

  const countryGeo = await fetchJson("100000_full.json");
  ensureFeatureCollection(countryGeo, "country map");

  const provinces = countryGeo.features
    .map((feature) => {
      const properties = feature?.properties ?? {};
      const code = normalizeCode(properties.adcode);
      const name = String(properties.name ?? "").trim();
      const level = String(properties.level ?? "").trim();

      return {
        code,
        name,
        level,
        feature,
      };
    })
    .filter((item) => item.code && item.name && item.level === "province")
    .sort((a, b) => Number(a.code) - Number(b.code));

  const mapIndex = {
    version: 1,
    country: {
      code: "100000",
      name: "中国",
      geoPath: "geo/country/china.json",
    },
    city: {
      code: "100000",
      name: "中国市级",
      geoPath: "geo/city/china-city.json",
    },
    provinceBoundary: {
      code: "100000",
      name: "中国省级边界",
      geoPath: "geo/province/china-boundary.json",
    },
    provinces: {},
  };
  const mergedCityFeatures = [];
  const mergedProvinceFeatures = [];
  const seenCityCodes = new Set();

  for (const province of provinces) {
    const provinceCode = province.code;
    const provinceName = province.name;

    const cityGeo = await fetchProvinceCityGeoJson(provinceCode);

    writeJson(
      resolve(PROVINCE_DIR, `${provinceCode}.json`),
      {
        type: "FeatureCollection",
        features: [province.feature],
      }
    );

    writeJson(resolve(CITY_DIR, `${provinceCode}.json`), cityGeo);
    mergedProvinceFeatures.push(province.feature);

    for (const feature of cityGeo.features) {
      const properties = feature?.properties ?? {};
      const code = normalizeCode(properties.adcode ?? properties.code);
      const dedupeKey = code ?? JSON.stringify(feature.geometry ?? {});

      if (seenCityCodes.has(dedupeKey)) {
        continue;
      }

      seenCityCodes.add(dedupeKey);
      mergedCityFeatures.push(feature);
    }

    mapIndex.provinces[provinceCode] = {
      code: provinceCode,
      name: provinceName,
      parentCode: "100000",
      geoPath: `geo/province/${provinceCode}.json`,
      cityGeoPath: `geo/city/${provinceCode}.json`,
    };

    console.log(`Fetched ${provinceCode} ${provinceName}`);
  }

  writeJson(resolve(CITY_DIR, "china-city.json"), {
    type: "FeatureCollection",
    features: mergedCityFeatures,
  });
  writeJson(resolve(PROVINCE_DIR, "china-boundary.json"), {
    type: "FeatureCollection",
    features: mergedProvinceFeatures,
  });
  writeJson(resolve(COUNTRY_DIR, "china.json"), countryGeo);
  writeFileSync(resolve(GEO_ROOT, "map-index.json"), JSON.stringify(mapIndex, null, 2));

  console.log(`Generated real GeoJSON for ${provinces.length} provinces`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
