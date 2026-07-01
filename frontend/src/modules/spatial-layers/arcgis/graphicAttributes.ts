import type {
  ParsedSpatialFeature,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";

export function createSpatialGraphicAttributes(
  feature: ParsedSpatialFeature,
  config: SpatialLayerConfig,
): Record<string, unknown> {
  const titleField = config.fields?.titleField;
  const configuredTitle =
    titleField && feature.properties[titleField] != null
      ? String(feature.properties[titleField])
      : undefined;

  return {
    ...feature.properties,
    id: feature.id,
    title: configuredTitle ?? config.name,
    sourceLayerId: feature.sourceLayerId,
    sourceLayerName: feature.sourceLayerName,
    geometryType: feature.geometryType,
  };
}
