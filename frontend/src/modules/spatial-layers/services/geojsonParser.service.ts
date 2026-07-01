import type { GeoJSONFeatureCollection } from "../types/geojson.types";
import { isSupportedGeoJSONGeometryType } from "../types/geojson.types";
import type {
  ParsedSpatialFeature,
  SpatialGeometryType,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";

function readFeatureId(
  properties: Record<string, unknown>,
  featureId: string | number | undefined,
  config: SpatialLayerConfig,
  index: number,
) {
  const configuredField = config.fields?.idField;
  const configuredId = configuredField ? properties[configuredField] : undefined;

  if (typeof configuredId === "string" || typeof configuredId === "number") {
    return configuredId;
  }

  return featureId ?? `${config.id}-${index + 1}`;
}

function isGeometryCompatible(
  expected: SpatialGeometryType,
  actual: SpatialGeometryType,
) {
  return expected === actual;
}

export function parseGeoJson(
  collection: GeoJSONFeatureCollection,
  config: SpatialLayerConfig,
): ParsedSpatialFeature[] {
  return collection.features.flatMap((feature, index) => {
    const geometry = feature.geometry;

    if (!geometry) {
      console.warn(`Skipped feature ${index + 1} in ${config.id}: geometry is empty.`);
      return [];
    }

    if (!isSupportedGeoJSONGeometryType(geometry.type)) {
      console.warn(
        `Skipped feature ${index + 1} in ${config.id}: unsupported geometry ${geometry.type}.`,
      );
      return [];
    }

    if (!isGeometryCompatible(config.geometryType, geometry.type)) {
      console.warn(
        `Skipped feature ${index + 1} in ${config.id}: expected ${config.geometryType}, received ${geometry.type}.`,
      );
      return [];
    }

    const properties = feature.properties ?? {};

    return [
      {
        id: readFeatureId(properties, feature.id, config, index),
        geometryType: geometry.type,
        coordinates: geometry.coordinates,
        properties,
        sourceLayerId: config.id,
        sourceLayerName: config.name,
      },
    ];
  });
}
