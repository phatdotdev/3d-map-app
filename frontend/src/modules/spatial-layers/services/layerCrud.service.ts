import { apiRequest } from "../../../services/api/client";
import { ensureAppMode } from "../../../config/runtime";
import type { GeoJSONGeometry } from "../types/geojson.types";
import type {
  SpatialGeometryType,
  SpatialLayerConfig,
  SpatialLayerConfigDocument,
} from "../types/spatial-layer.types";
import { sortLayersByOrder } from "./layerConfig.service";

const SPATIAL_LAYERS_API_PATH = "/spatial-layers";

type LayerSavePayload = {
  layer: SpatialLayerConfig;
  geoJsonFile?: {
    fileName: string;
    text: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFeatureCollection(
  value: unknown,
): value is Record<string, unknown> & { features: unknown[] } {
  return (
    isRecord(value) &&
    value.type === "FeatureCollection" &&
    Array.isArray(value.features)
  );
}

function assertGeometryMatches(
  collection: Record<string, unknown>,
  geometryType: SpatialGeometryType,
) {
  const features = collection.features;

  if (!Array.isArray(features) || features.length === 0) {
    throw new Error("GeoJSON file must include at least one feature.");
  }

  const invalidFeature = features.find((feature) => {
    if (!isRecord(feature)) return true;
    const geometry = feature.geometry;
    if (geometry === null) return false;
    return !isRecord(geometry) || geometry.type !== geometryType;
  });

  if (invalidFeature) {
    throw new Error(`GeoJSON geometry does not match ${geometryType}.`);
  }
}

async function readGeoJsonFile(
  file: File,
  geometryType: SpatialGeometryType,
) {
  const fileName = file.name.toLowerCase();

  if (!fileName.endsWith(".geojson") && !fileName.endsWith(".json")) {
    throw new Error("Only .geojson or .json files are supported.");
  }

  const text = await file.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("GeoJSON file is not valid JSON.");
  }

  if (!isFeatureCollection(parsed)) {
    throw new Error("GeoJSON file must be a FeatureCollection.");
  }

  assertGeometryMatches(parsed, geometryType);

  return {
    fileName: file.name,
    text,
  };
}

function parseLayerDocumentPayload(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.layers)) {
    throw new Error("Layer API response is invalid.");
  }

  return sortLayersByOrder(
    (payload as unknown as SpatialLayerConfigDocument).layers,
  );
}

async function requestLayerUpdate(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  payload?: LayerSavePayload,
) {
  const responsePayload = await apiRequest<unknown>(url, {
    method,
    headers: payload
      ? {
          "Content-Type": "application/json",
        }
      : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  return parseLayerDocumentPayload(responsePayload);
}

export async function createStoredLayer(
  layer: SpatialLayerConfig,
  file: File,
) {
  ensureAppMode("Tao layer");

  return requestLayerUpdate(SPATIAL_LAYERS_API_PATH, "POST", {
    layer,
    geoJsonFile: await readGeoJsonFile(file, layer.geometryType),
  });
}

export async function updateStoredLayer(
  layerId: string,
  layer: SpatialLayerConfig,
  file?: File | null,
) {
  ensureAppMode("Cap nhat layer");

  return requestLayerUpdate(
    `${SPATIAL_LAYERS_API_PATH}/${encodeURIComponent(layerId)}`,
    "PUT",
    {
      layer,
      geoJsonFile: file
        ? await readGeoJsonFile(file, layer.geometryType)
        : undefined,
    },
  );
}

export async function deleteStoredLayer(layerId: string) {
  ensureAppMode("Xoa layer");

  return requestLayerUpdate(
    `${SPATIAL_LAYERS_API_PATH}/${encodeURIComponent(layerId)}`,
    "DELETE",
  );
}

export async function updateStoredLayerFeatureGeometry(
  layerId: string,
  featureId: string | number,
  geometry: GeoJSONGeometry,
) {
  ensureAppMode("Cap nhat feature");

  await apiRequest<unknown>(
    `${SPATIAL_LAYERS_API_PATH}/${encodeURIComponent(
      layerId,
    )}/features/${encodeURIComponent(String(featureId))}/geometry`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ geometry }),
    },
  );
}
