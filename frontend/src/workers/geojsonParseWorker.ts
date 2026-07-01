import type { GeoJSONFeatureCollection } from "../modules/spatial-layers/types/geojson.types";

type BboxArray = [number, number, number, number];

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

function intersects(feature: unknown, bbox: BboxArray) {
  if (typeof feature !== "object" || feature === null) return false;

  const geometry = (feature as { geometry?: { coordinates?: unknown } }).geometry;
  const paddingMeters = getFeatureModelPaddingMeters(feature);

  return collectPositions(geometry?.coordinates).some((position) =>
    positionIntersectsBbox(position, bbox, paddingMeters),
  );
}

self.onmessage = (
  event: MessageEvent<{
    collection: GeoJSONFeatureCollection;
    bbox: BboxArray;
  }>,
) => {
  const { collection, bbox } = event.data;

  self.postMessage({
    collection: {
      ...collection,
      features: collection.features.filter((feature) => intersects(feature, bbox)),
    },
  });
};

export {};
