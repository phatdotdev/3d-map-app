import type { GeoJSONFeatureCollection } from "../../modules/spatial-layers/types/geojson.types";
import type { BboxArray } from "./bbox";

type WorkerResponse = {
  collection?: GeoJSONFeatureCollection;
  error?: string;
};

const METERS_PER_DEGREE = 111_320;
const DEFAULT_MODEL_PADDING_METERS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectPositions(value: unknown, result: number[][] = []) {
  if (!Array.isArray(value)) return result;

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    result.push(value as number[]);
    return result;
  }

  value.forEach((item) => collectPositions(item, result));
  return result;
}

function toPositiveNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function getFeatureModelPaddingMeters(feature: unknown) {
  if (!isRecord(feature) || !isRecord(feature.properties)) return 0;
  if (feature.properties.entityType !== "model3d") return 0;

  const scale = isRecord(feature.properties.scale)
    ? feature.properties.scale
    : {};
  const style = isRecord(feature.properties.style)
    ? feature.properties.style
    : {};
  const dimensions = [
    toPositiveNumber(scale.x),
    toPositiveNumber(scale.y),
    toPositiveNumber(scale.z),
    toPositiveNumber(style.size),
  ].filter((value): value is number => value !== null);

  return Math.max(DEFAULT_MODEL_PADDING_METERS, ...dimensions) / 2;
}

function positionIntersectsBbox(
  position: number[],
  bbox: BboxArray,
  paddingMeters: number,
) {
  const [longitude, latitude] = position;
  const latitudePadding = paddingMeters / METERS_PER_DEGREE;
  const longitudePadding =
    paddingMeters /
    Math.max(1, METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));

  return (
    longitude >= bbox[0] - longitudePadding &&
    longitude <= bbox[2] + longitudePadding &&
    latitude >= bbox[1] - latitudePadding &&
    latitude <= bbox[3] + latitudePadding
  );
}

function featureIntersectsBbox(feature: unknown, bbox: BboxArray) {
  if (typeof feature !== "object" || feature === null) return false;

  const geometry = (feature as { geometry?: { coordinates?: unknown } }).geometry;
  const positions = collectPositions(geometry?.coordinates);
  const paddingMeters = getFeatureModelPaddingMeters(feature);

  return positions.some((position) =>
    positionIntersectsBbox(position, bbox, paddingMeters),
  );
}

export function filterGeoJsonByBboxSync(
  collection: GeoJSONFeatureCollection,
  bbox: BboxArray | null,
) {
  if (!bbox) return collection;

  return {
    ...collection,
    features: collection.features.filter((feature) =>
      featureIntersectsBbox(feature, bbox),
    ),
  };
}

export async function filterGeoJsonByBbox(
  collection: GeoJSONFeatureCollection,
  bbox: BboxArray | null,
) {
  if (!bbox || collection.features.length < 1000 || typeof Worker === "undefined") {
    return filterGeoJsonByBboxSync(collection, bbox);
  }

  try {
    const worker = new Worker(
      new URL("../../workers/geojsonParseWorker.ts", import.meta.url),
      { type: "module" },
    );

    return await new Promise<GeoJSONFeatureCollection>((resolve) => {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        worker.terminate();

        if (event.data.collection) {
          resolve(event.data.collection);
          return;
        }

        resolve(filterGeoJsonByBboxSync(collection, bbox));
      };
      worker.onerror = () => {
        worker.terminate();
        resolve(filterGeoJsonByBboxSync(collection, bbox));
      };
      worker.postMessage({ collection, bbox });
    });
  } catch {
    return filterGeoJsonByBboxSync(collection, bbox);
  }
}
