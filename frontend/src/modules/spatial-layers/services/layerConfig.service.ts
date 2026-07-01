import { apiRequest } from "../../../services/api/client";
import { isWebMode } from "../../../config/runtime";
import { staticAssetEntityDataSource } from "../../../services/data-source/StaticAssetEntityDataSource";
import type {
  SpatialGeometryType,
  SpatialLayerConfig,
  SpatialLayerConfigDocument,
} from "../types/spatial-layer.types";

const SUPPORTED_GEOMETRY_TYPES: SpatialGeometryType[] = [
  "Point",
  "LineString",
  "Polygon",
  "MultiPolygon",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSpatialGeometryType(value: unknown): value is SpatialGeometryType {
  return (
    typeof value === "string" &&
    SUPPORTED_GEOMETRY_TYPES.includes(value as SpatialGeometryType)
  );
}

function assertValidLayerConfig(
  layer: SpatialLayerConfig,
): SpatialLayerConfig {
  if (!layer.id || !layer.name) {
    throw new Error("Spatial layer config is missing id or name.");
  }

  if (layer.sourceType !== "geojson") {
    throw new Error(`Spatial layer ${layer.id} must use sourceType geojson.`);
  }

  if (!layer.sourcePath) {
    throw new Error(`Spatial layer ${layer.id} is missing sourcePath.`);
  }

  if (!isSpatialGeometryType(layer.geometryType)) {
    throw new Error(
      `Spatial layer ${layer.id} has unsupported geometryType ${String(
        layer.geometryType,
      )}.`,
    );
  }

  if (!isRecord(layer.display) || typeof layer.display.mode !== "string") {
    throw new Error(`Spatial layer ${layer.id} is missing display config.`);
  }

  return layer;
}

function assertValidLayerDocument(
  document: unknown,
): SpatialLayerConfigDocument {
  if (!isRecord(document)) {
    throw new Error("Layer API response must be an object.");
  }

  if (!document.version || !Array.isArray(document.layers)) {
    throw new Error("Layer API response must include version and layers.");
  }

  return document as unknown as SpatialLayerConfigDocument;
}

export function sortLayersByOrder(
  configs: SpatialLayerConfig[],
): SpatialLayerConfig[] {
  return [...configs].sort(
    (left, right) => (left.order ?? 9999) - (right.order ?? 9999),
  );
}

export async function loadSpatialLayerConfigs(): Promise<SpatialLayerConfig[]> {
  if (isWebMode()) {
    return sortLayersByOrder(
      (await staticAssetEntityDataSource.getLayers()).map(assertValidLayerConfig),
    );
  }

  const document = assertValidLayerDocument(
    await apiRequest<unknown>("/spatial-layers"),
  );

  return sortLayersByOrder(document.layers.map(assertValidLayerConfig));
}

export function getEnabledLayers(
  configs: SpatialLayerConfig[],
): SpatialLayerConfig[] {
  return sortLayersByOrder(configs.filter((config) => config.enabled));
}
