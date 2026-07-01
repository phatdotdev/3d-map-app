import type {
  SpatialLineDisplayConfig,
  SpatialPolygonDisplayConfig,
} from "../types/spatial-layer.types";

export const DEFAULT_SPATIAL_Z = 0;

export const DEFAULT_ICON_DISPLAY = {
  type: "picture",
  url: "/icons/map-pin.svg",
  width: 24,
  height: 24,
  color: "#2563eb",
  outlineColor: "#ffffff",
  outlineWidth: 2,
} as const;

export const DEFAULT_MODEL_DISPLAY = {
  enabled: false,
  url: "/models/manhole.glb",
  width: 2,
  height: 2,
  depth: 2,
  heading: 0,
  tilt: 0,
  roll: 0,
} as const;

export const DEFAULT_LINE_DISPLAY: SpatialLineDisplayConfig = {
  color: "#0ea5e9",
  width: 4,
  flatWidth: 4,
  pipeWidth: 4,
  style: "solid",
  profile: "circle",
  cap: "round",
  join: "round",
};

export const DEFAULT_POLYGON_DISPLAY: SpatialPolygonDisplayConfig = {
  fillColor: "#ef4444",
  fillOpacity: 0.35,
  outlineColor: "#991b1b",
  outlineWidth: 1,
};
