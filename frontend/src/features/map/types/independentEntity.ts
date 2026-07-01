import type { MapPoint3D } from "./mapPoint";

export type GeoJsonPosition = [number, number] | [number, number, number];

export type IndependentEntityType =
  | "point"
  | "model3d"
  | "linestring"
  | "polygon"
  | "multipolygon";

export type IndependentCreationType = Exclude<IndependentEntityType, never>;

export type IndependentCreationMode =
  | "idle"
  | "creating-point"
  | "creating-model3d"
  | "creating-linestring"
  | "creating-polygon"
  | "creating-multipolygon"
  | "editing";

export type IndependentEntitySource = "independent" | "layer";

export type GeoJsonPointGeometry = {
  type: "Point";
  coordinates: GeoJsonPosition;
};

export type GeoJsonLineStringGeometry = {
  type: "LineString";
  coordinates: GeoJsonPosition[];
};

export type GeoJsonPolygonGeometry = {
  type: "Polygon";
  coordinates: GeoJsonPosition[][];
};

export type GeoJsonMultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: GeoJsonPosition[][][];
};

export type IndependentEntityGeometry =
  | GeoJsonPointGeometry
  | GeoJsonLineStringGeometry
  | GeoJsonPolygonGeometry
  | GeoJsonMultiPolygonGeometry;

export type IndependentEntityStyle = {
  color?: string;
  size?: number;
  iconUrl?: string;
  pinColor?: string;
  pinSize?: number;
  width?: number;
  flatWidth?: number;
  pipeWidth?: number;
  style?: "solid" | "dash" | "dot" | "dash-dot" | "short-dash";
  profile?: "circle" | "quad";
  fillColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
};

export type IndependentModelSplitChild = {
  id: string;
  name?: string;
  modelUrl?: string;
  url?: string;
  visible?: boolean;
  transformMode?: "inherit-parent";
  metadata?: {
    bounds?: {
      min?: number[];
      max?: number[];
      size?: number[];
    };
  } & Record<string, unknown>;
};

export type IndependentModelSplit = {
  enabled?: boolean;
  renderMode?: "parent" | "children";
  manifestUrl?: string;
  parentBounds?: {
    min?: number[];
    max?: number[];
    size?: number[];
  };
  children?: IndependentModelSplitChild[];
};

export type IndependentModelScale =
  | number
  | {
      x?: number;
      y?: number;
      z?: number;
    };

export type IndependentEntityProperties = {
  id: string;
  name: string;
  entityType: IndependentEntityType;
  modelId?: string;
  modelUrl?: string;
  split?: IndependentModelSplit;
  scale?: IndependentModelScale;
  rotation?: {
    heading?: number;
    tilt?: number;
    roll?: number;
  };
  style?: IndependentEntityStyle;
  metadata?: Record<string, unknown>;
} & Record<string, unknown>;

export type IndependentEntityFeature = {
  type: "Feature";
  id?: string | number;
  geometry: IndependentEntityGeometry;
  properties: IndependentEntityProperties;
};

export type CreationCoordinate = [number, number, number];

export type SplitRenderOptions = {
  activeSplitEntityIds?: ReadonlySet<string>;
};

export type IndependentEntityFormDraft = {
  name: string;
  modelUrl: string;
  styleText: string;
  metadataText: string;
  coordinatesText: string;
  scale: number;
  heading: number;
  tilt: number;
  roll: number;
};

function getPositiveFiniteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

export function getIndependentModelScale(
  scale: IndependentModelScale | undefined,
  fallback = 20,
) {
  if (typeof scale === "number") {
    return getPositiveFiniteNumber(scale) ?? fallback;
  }

  if (scale && typeof scale === "object") {
    return (
      getPositiveFiniteNumber(scale.z) ??
      getPositiveFiniteNumber(scale.x) ??
      getPositiveFiniteNumber(scale.y) ??
      fallback
    );
  }

  return fallback;
}

export function getIndependentEntityId(feature: IndependentEntityFeature) {
  return feature.properties.id || String(feature.id ?? "");
}

export function getIndependentEntityType(feature: IndependentEntityFeature) {
  return feature.properties.entityType;
}

export function isPointLikeIndependentEntity(feature: IndependentEntityFeature) {
  return feature.geometry.type === "Point";
}

export function toMapPoint3D(feature: IndependentEntityFeature): MapPoint3D | null {
  if (feature.geometry.type !== "Point") {
    return null;
  }

  const coordinates = feature.geometry.coordinates;
  const [longitude, latitude, z = 0] = coordinates;
  const properties = feature.properties;
  const style = properties.style ?? {};
  const isModel = properties.entityType === "model3d";
  const size = style.size ?? style.pinSize ?? 32;

  return {
    id: getIndependentEntityId(feature),
    name: properties.name,
    type: isModel ? "model3d" : "point",
    longitude,
    latitude,
    z,
    metadata: properties.metadata,
    source: {
      kind: "independent",
    },
    pin: {
      enabled: true,
      color: style.pinColor ?? style.color ?? "#ef4444",
      size,
      iconUrl: style.iconUrl ?? "/icons/map-pin.svg",
    },
    model3D: isModel
      ? {
          enabled: true,
          url: properties.modelUrl ?? "",
          scale: getIndependentModelScale(properties.scale),
          heading: properties.rotation?.heading ?? 0,
          tilt: properties.rotation?.tilt ?? 0,
          roll: properties.rotation?.roll ?? 0,
        }
      : undefined,
  };
}

function getModelDisplayHeight(point: MapPoint3D) {
  return (
    getPositiveFiniteNumber(point.model3D?.scale) ??
    getPositiveFiniteNumber(point.model3D?.height) ??
    getPositiveFiniteNumber(point.model3D?.width) ??
    getPositiveFiniteNumber(point.model3D?.depth) ??
    20
  );
}

function getVerticalBoundsSize(bounds: { size?: number[] } | undefined) {
  return getPositiveFiniteNumber(bounds?.size?.[1]);
}

function getSplitChildDisplayHeight(
  parentPoint: MapPoint3D,
  split: IndependentModelSplit,
  child: IndependentModelSplitChild,
) {
  const parentHeight = getModelDisplayHeight(parentPoint);
  const parentBoundsHeight = getVerticalBoundsSize(split.parentBounds);
  const childBoundsHeight = getVerticalBoundsSize(child.metadata?.bounds);

  if (!parentBoundsHeight || !childBoundsHeight) {
    return parentHeight;
  }

  return parentHeight * (childBoundsHeight / parentBoundsHeight);
}

export function toMapPoint3DList(
  features: IndependentEntityFeature[],
  options: SplitRenderOptions = {},
) {
  return features.flatMap((feature) => {
    const parentPoint = toMapPoint3D(feature);

    if (!parentPoint || feature.properties.entityType !== "model3d") {
      return parentPoint ? [parentPoint] : [];
    }

    const split = feature.properties.split;
    const children = split?.children ?? [];
    const isSplitActive = options.activeSplitEntityIds?.has(
      getIndependentEntityId(feature),
    );

    if (
      !isSplitActive ||
      !split?.enabled ||
      split.renderMode !== "children" ||
      children.length === 0
    ) {
      return [parentPoint];
    }

    return children
      .filter((child) => child.visible !== false && (child.modelUrl || child.url))
      .map((child) => ({
        ...parentPoint,
        id: `${parentPoint.id}:${child.id}`,
        name: child.name ?? `${parentPoint.name} / ${child.id}`,
        model3D: parentPoint.model3D
          ? {
              ...parentPoint.model3D,
              url: child.modelUrl ?? child.url ?? parentPoint.model3D.url,
              scale: getSplitChildDisplayHeight(parentPoint, split, child),
            }
          : parentPoint.model3D,
        metadata: {
          ...parentPoint.metadata,
          parentEntityId: parentPoint.id,
          splitPartId: child.id,
        },
      }));
  });
}
