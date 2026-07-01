import { DEFAULT_SPATIAL_Z } from "../constants/layer-defaults";
import type { SpatialLayerConfig } from "../types/spatial-layer.types";

export type ArcGISCoordinate = [number, number, number];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGeoJsonPosition(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

export function getDefaultZ(config: SpatialLayerConfig) {
  return config.display.z ?? DEFAULT_SPATIAL_Z;
}

export function toArcGISCoordinate(
  position: unknown,
  config: SpatialLayerConfig,
): ArcGISCoordinate | null {
  if (!isGeoJsonPosition(position)) {
    return null;
  }

  const z = isFiniteNumber(position[2]) ? position[2] : getDefaultZ(config);

  return [position[0], position[1], z];
}

export function toPointCoordinate(
  coordinates: unknown,
  config: SpatialLayerConfig,
): ArcGISCoordinate | null {
  return toArcGISCoordinate(coordinates, config);
}

export function toLinePath(
  coordinates: unknown,
  config: SpatialLayerConfig,
): ArcGISCoordinate[] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .map((position) => toArcGISCoordinate(position, config))
    .filter((position): position is ArcGISCoordinate => position !== null);
}

function toPolygonRing(
  coordinates: unknown,
  config: SpatialLayerConfig,
): ArcGISCoordinate[] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .map((position) => toArcGISCoordinate(position, config))
    .filter((position): position is ArcGISCoordinate => position !== null);
}

export function toPolygonRings(
  coordinates: unknown,
  config: SpatialLayerConfig,
): ArcGISCoordinate[][] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  if (config.geometryType === "Polygon") {
    return coordinates
      .map((ring) => toPolygonRing(ring, config))
      .filter((ring) => ring.length >= 4);
  }

  return coordinates.flatMap((polygon) => {
    if (!Array.isArray(polygon)) {
      return [];
    }

    return polygon
      .map((ring) => toPolygonRing(ring, config))
      .filter((ring) => ring.length >= 4);
  });
}
