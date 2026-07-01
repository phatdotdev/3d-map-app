import type Layer from "@arcgis/core/layers/Layer";

import { createLineLayer } from "./createLineLayer";
import { createPointLayer } from "./createPointLayer";
import { createPolygonLayer } from "./createPolygonLayer";
import { loadGeoJson } from "../services/geojsonLoader.service";
import { parseGeoJson } from "../services/geojsonParser.service";
import type { GeoJSONFeatureCollection } from "../types/geojson.types";
import type { SpatialLayerConfig } from "../types/spatial-layer.types";

export function createSpatialLayerFromGeoJson(
  config: SpatialLayerConfig,
  geoJson: GeoJSONFeatureCollection,
) {
  const parsedFeatures = parseGeoJson(geoJson, config);
  const maxFeatures = config.performance?.maxFeatures ?? 0;
  const features =
    maxFeatures > 0 ? parsedFeatures.slice(0, maxFeatures) : parsedFeatures;

  if (features.length < parsedFeatures.length) {
    console.info(
      `Layer ${config.id}: rendering ${features.length}/${parsedFeatures.length} features by maxFeatures.`,
    );
  }

  switch (config.geometryType) {
    case "Point":
      return createPointLayer(config, features);
    case "LineString":
      return createLineLayer(config, features);
    case "Polygon":
    case "MultiPolygon":
      return createPolygonLayer(config, features);
    default:
      throw new Error(`Unsupported geometry type for layer ${config.id}.`);
  }
}

export async function createSpatialLayer(
  config: SpatialLayerConfig,
): Promise<Layer> {
  const geoJson = await loadGeoJson(config.sourcePath);
  return createSpatialLayerFromGeoJson(config, geoJson);
}
