export type SpatialGeometryType =
  | "Point"
  | "LineString"
  | "Polygon"
  | "MultiPolygon";

export type SpatialDisplayMode = "icon" | "model" | "line" | "polygon";

export type SpatialLayerLoadStatus = "idle" | "loading" | "ready" | "error";

export type SpatialLayerLoadStrategy = "all" | "viewport" | "scale";

export type SpatialPointDisplayMode = "icon" | "model";

export interface SpatialZoomRuleConfig {
  enabled: boolean;
  switchToModelScale: number;
  farMode: SpatialPointDisplayMode;
  nearMode: SpatialPointDisplayMode;
}

export interface SpatialIconDisplayConfig {
  type: "picture";
  url: string;
  width: number;
  height: number;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
}

export interface SpatialModelDisplayConfig {
  enabled: boolean;
  url: string;
  width: number;
  height: number;
  depth: number;
  heading?: number;
  tilt?: number;
  roll?: number;
}

export interface SpatialLineDisplayConfig {
  color: string;
  width: number;
  flatWidth?: number;
  pipeWidth?: number;
  style?: "solid" | "dash" | "dot" | "dash-dot" | "short-dash";
  profile?: "circle" | "quad";
  cap?: "round" | "butt" | "square";
  join?: "round" | "miter" | "bevel";
}

export interface SpatialPolygonDisplayConfig {
  fillColor: string;
  fillOpacity: number;
  outlineColor: string;
  outlineWidth: number;
}

export interface SpatialLayerDisplayConfig {
  mode: SpatialDisplayMode;
  minScale?: number;
  maxScale?: number;
  z?: number;
  zoomRule?: SpatialZoomRuleConfig;
  icon?: SpatialIconDisplayConfig;
  model?: SpatialModelDisplayConfig;
  line?: SpatialLineDisplayConfig;
  polygon?: SpatialPolygonDisplayConfig;
}

export interface SpatialLayerConfig {
  id: string;
  name: string;
  description?: string;
  sourceType: "geojson";
  sourcePath: string;
  geometryType: SpatialGeometryType;
  enabled: boolean;
  visible: boolean;
  order?: number;
  display: SpatialLayerDisplayConfig;
  popup?: {
    enabled: boolean;
  };
  fields?: {
    idField?: string;
    titleField?: string;
  };
  performance?: {
    maxFeatures?: number;
    loadStrategy?: SpatialLayerLoadStrategy;
    useClustering?: boolean;
    simplifyGeometry?: boolean;
  };
  metadata?: Record<string, unknown>;
}

export interface SpatialLayerConfigDocument {
  version: string;
  updatedAt?: string;
  layers: SpatialLayerConfig[];
}

export interface ParsedSpatialFeature {
  id: string | number;
  geometryType: SpatialGeometryType;
  coordinates: unknown;
  properties: Record<string, unknown>;
  sourceLayerId: string;
  sourceLayerName: string;
}

export interface SpatialLayerState {
  config: SpatialLayerConfig;
  visible: boolean;
  status: SpatialLayerLoadStatus;
  error?: string;
}

export interface SelectedSpatialFeature {
  id: string | number;
  sourceLayerId: string;
  sourceLayerName: string;
  geometryType: SpatialGeometryType;
  mapEditable?: boolean;
  attributes: Record<string, unknown>;
  geometryJson?: Record<string, unknown>;
}
