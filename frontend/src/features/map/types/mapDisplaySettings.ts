export type MapBasemapOption =
  | "osm"
  | "arcgis-streets"
  | "arcgis-satellite"
  | "arcgis-hybrid"
  | "arcgis-topo"
  | "arcgis-dark-gray"
  | "arcgis-light-gray"
  | "arcgis-navigation";

export type MapDisplaySettings = {
  basemap: MapBasemapOption;
  groundOpacity: number;
  modelSwitchScale: number;
};

export const MAP_DISPLAY_SETTINGS_STORAGE_KEY =
  "arcgis-3d-web.map-display-settings";

export const DEFAULT_MAP_DISPLAY_SETTINGS: MapDisplaySettings = {
  basemap: "osm",
  groundOpacity: 0.45,
  modelSwitchScale: 3000,
};

export const VALID_BASEMAPS: MapBasemapOption[] = [
  "osm",
  "arcgis-streets",
  "arcgis-satellite",
  "arcgis-hybrid",
  "arcgis-topo",
  "arcgis-dark-gray",
  "arcgis-light-gray",
  "arcgis-navigation",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function clampGroundOpacity(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAP_DISPLAY_SETTINGS.groundOpacity;
  }

  return Math.min(1, Math.max(0.05, value));
}

export function normalizeModelSwitchScale(value: number) {
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_MAP_DISPLAY_SETTINGS.modelSwitchScale;
  }

  return Math.round(value);
}

export function normalizeMapDisplaySettings(
  value: unknown,
): MapDisplaySettings {
  if (!isRecord(value)) {
    return DEFAULT_MAP_DISPLAY_SETTINGS;
  }

  let basemap: MapBasemapOption = "osm";
  const rawBasemap = value.basemap;
  if (rawBasemap === "arcgis/streets" || rawBasemap === "arcgis-streets") {
    basemap = "arcgis-streets";
  } else if (VALID_BASEMAPS.includes(rawBasemap as MapBasemapOption)) {
    basemap = rawBasemap as MapBasemapOption;
  }

  const groundOpacity = clampGroundOpacity(Number(value.groundOpacity));
  const modelSwitchScale = normalizeModelSwitchScale(
    Number(value.modelSwitchScale),
  );

  return {
    basemap,
    groundOpacity,
    modelSwitchScale,
  };
}
