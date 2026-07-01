import type { SpatialGeometryType } from "./spatial-layer.types";

export type GeoJSONPosition = [number, number] | [number, number, number];

export interface GeoJSONPointGeometry {
  type: "Point";
  coordinates: GeoJSONPosition;
}

export interface GeoJSONLineStringGeometry {
  type: "LineString";
  coordinates: GeoJSONPosition[];
}

export interface GeoJSONPolygonGeometry {
  type: "Polygon";
  coordinates: GeoJSONPosition[][];
}

export interface GeoJSONMultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: GeoJSONPosition[][][];
}

export type GeoJSONGeometry =
  | GeoJSONPointGeometry
  | GeoJSONLineStringGeometry
  | GeoJSONPolygonGeometry
  | GeoJSONMultiPolygonGeometry;

export interface GeoJSONFeature {
  type: "Feature";
  id?: string | number;
  geometry: GeoJSONGeometry | null;
  properties: Record<string, unknown> | null;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export function isSupportedGeoJSONGeometryType(
  type: string,
): type is SpatialGeometryType {
  return (
    type === "Point" ||
    type === "LineString" ||
    type === "Polygon" ||
    type === "MultiPolygon"
  );
}
