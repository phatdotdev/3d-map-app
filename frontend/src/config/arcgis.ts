import esriConfig from "@arcgis/core/config";

const apiKey = import.meta.env.VITE_ARCGIS_API_KEY?.trim();

if (!apiKey) {
  console.error(
    "[ArcGIS] Missing VITE_ARCGIS_API_KEY. Basemap and elevation services will not load.",
  );
} else {
  esriConfig.apiKey = apiKey;
}

export default esriConfig;
