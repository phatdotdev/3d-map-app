import Graphic from "@arcgis/core/Graphic";
import Map from "@arcgis/core/Map";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import FeatureLayer, {
  type FeatureLayerProperties,
} from "@arcgis/core/layers/FeatureLayer";
import type { FieldProperties } from "@arcgis/core/layers/support/Field";

import {
  getIndependentEntityId,
  getIndependentEntityType,
  toMapPoint3D,
  toMapPoint3DList,
  type CreationCoordinate,
  type GeoJsonPosition,
  type IndependentEntityFeature,
  type IndependentEntityStyle,
  type SplitRenderOptions,
} from "../../features/map/types/independentEntity";
import {
  renderPoint,
  renderPoints,
} from "./renderPoint";

export const INDEPENDENT_LINE_FEATURE_LAYER_ID =
  "independent-entity-line-feature-layer";
export const INDEPENDENT_POLYGON_FEATURE_LAYER_ID =
  "independent-entity-polygon-feature-layer";

type GraphicSymbol = NonNullable<FeatureLayerProperties["renderer"]>;
type RendererSymbol = Record<string, unknown>;
type GeometryFeatureType = "LineString" | "Polygon" | "MultiPolygon";
type LineDisplayMode = "flat" | "pipe";
const DEFAULT_PIPE_WIDTH = 2;
const DEFAULT_FLAT_WIDTH = 4;
const independentLineDisplayModeCache = new WeakMap<
  FeatureLayer,
  LineDisplayMode
>();

function toCoordinate(position: GeoJsonPosition): CreationCoordinate {
  return [position[0], position[1], position[2] ?? 0];
}

function toGeoJsonPosition(coordinate: number[]): GeoJsonPosition {
  return [
    Number(coordinate[0] ?? 0),
    Number(coordinate[1] ?? 0),
    Number(coordinate[2] ?? 0),
  ];
}

function createFields(): FieldProperties[] {
  return [
    { name: "OBJECTID", alias: "OBJECTID", type: "oid" },
    { name: "entityId", alias: "Entity ID", type: "string" },
    { name: "sourceKind", alias: "Source Kind", type: "string" },
    { name: "name", alias: "Name", type: "string" },
    { name: "entityType", alias: "Entity Type", type: "string" },
    { name: "geometryType", alias: "Geometry Type", type: "string" },
  ];
}

function createPopupTemplate() {
  return {
    title: "{name}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          { fieldName: "entityId", label: "Entity ID" },
          { fieldName: "entityType", label: "Entity Type" },
          { fieldName: "geometryType", label: "Geometry Type" },
        ],
      },
    ],
  };
}

function createAttributes(
  feature: IndependentEntityFeature,
  objectId: number,
) {
  return {
    OBJECTID: objectId,
    entityId: getIndependentEntityId(feature),
    sourceKind: "independent",
    name: feature.properties.name,
    entityType: getIndependentEntityType(feature),
    geometryType: feature.geometry.type,
  };
}

function createLineFlatSymbol(style?: IndependentEntityStyle): RendererSymbol {
  return {
    type: "simple-line",
    color: style?.color ?? "#2563eb",
    width: style?.flatWidth ?? style?.width ?? DEFAULT_FLAT_WIDTH,
    style: style?.style ?? "solid",
    cap: "round",
    join: "round",
  };
}

function createLinePipeSymbol(style?: IndependentEntityStyle): RendererSymbol {
  const width = Number(style?.pipeWidth ?? style?.width ?? DEFAULT_PIPE_WIDTH);

  return {
    type: "line-3d",
    symbolLayers: [
      {
        type: "path",
        profile: style?.profile ?? "circle",
        anchor: "bottom",
        material: {
          color: style?.color ?? "#2563eb",
        },
        width: Number.isFinite(width) && width > 0 ? width : DEFAULT_PIPE_WIDTH,
        height: Number.isFinite(width) && width > 0 ? width : DEFAULT_PIPE_WIDTH,
        cap: "round",
        join: "round",
      },
    ],
  };
}

function createLineSymbol(
  style?: IndependentEntityStyle,
  mode: LineDisplayMode = "flat",
): RendererSymbol {
  return mode === "pipe" ? createLinePipeSymbol(style) : createLineFlatSymbol(style);
}

function createPolygonSymbol(style?: IndependentEntityStyle): RendererSymbol {
  return {
    type: "simple-fill",
    color: style?.fillColor ?? "rgba(37, 99, 235, 0.25)",
    outline: {
      color: style?.outlineColor ?? style?.color ?? "#2563eb",
      width: style?.outlineWidth ?? 2,
    },
  };
}

function createRenderer(
  features: IndependentEntityFeature[],
  geometryTypes: GeometryFeatureType[],
  lineDisplayMode: LineDisplayMode = "flat",
): GraphicSymbol {
  const uniqueValueInfos = features
    .filter((feature) =>
      geometryTypes.includes(feature.geometry.type as GeometryFeatureType),
    )
    .map((feature) => {
      const isLine = feature.geometry.type === "LineString";
      const symbol = isLine
        ? createLineSymbol(feature.properties.style, lineDisplayMode)
        : createPolygonSymbol(feature.properties.style);

      return {
        value: getIndependentEntityId(feature),
        label: feature.properties.name,
        symbol,
      };
    });

  return {
    type: "unique-value",
    field: "entityId",
    defaultSymbol:
      geometryTypes.length === 1 && geometryTypes[0] === "LineString"
        ? createLineSymbol(undefined, lineDisplayMode)
        : createPolygonSymbol(),
    uniqueValueInfos,
  } as unknown as GraphicSymbol;
}

function createPolyline(paths: CreationCoordinate[][]) {
  return new Polyline({
    paths,
    hasZ: true,
    spatialReference: {
      wkid: 4326,
    },
  });
}

function createPolygon(rings: CreationCoordinate[][]) {
  return new Polygon({
    rings,
    hasZ: true,
    spatialReference: {
      wkid: 4326,
    },
  });
}

function createLineFeature(
  feature: IndependentEntityFeature,
  objectId: number,
) {
  if (feature.geometry.type !== "LineString") return null;

  const path = feature.geometry.coordinates.map(toCoordinate);

  if (path.length < 2) return null;

  return new Graphic({
    geometry: createPolyline([path]),
    attributes: createAttributes(feature, objectId),
    popupTemplate: createPopupTemplate(),
  });
}

function createPolygonFeature(
  feature: IndependentEntityFeature,
  objectId: number,
) {
  if (
    feature.geometry.type !== "Polygon" &&
    feature.geometry.type !== "MultiPolygon"
  ) {
    return null;
  }

  const rings =
    feature.geometry.type === "Polygon"
      ? feature.geometry.coordinates.map((ring) => ring.map(toCoordinate))
      : feature.geometry.coordinates.flatMap((polygon) =>
          polygon.map((ring) => ring.map(toCoordinate)),
        );

  if (rings.length === 0) return null;

  return new Graphic({
    geometry: createPolygon(rings),
    attributes: createAttributes(feature, objectId),
    popupTemplate: createPopupTemplate(),
  });
}

function getNextObjectId(layer: FeatureLayer) {
  return layer.source.reduce((maxObjectId, feature) => {
    const featureObjectId = Number(feature.attributes?.OBJECTID ?? 0);
    return Math.max(maxObjectId, featureObjectId);
  }, 0) + 1;
}

function createLineFeatureLayer() {
  return new FeatureLayer({
    id: INDEPENDENT_LINE_FEATURE_LAYER_ID,
    title: "Independent Lines",
    geometryType: "polyline",
    objectIdField: "OBJECTID",
    fields: createFields(),
    source: [],
    popupEnabled: true,
    popupTemplate: createPopupTemplate(),
    renderer: createRenderer([], ["LineString"], "flat"),
    spatialReference: { wkid: 4326 },
    hasZ: true,
    elevationInfo: {
      mode: "absolute-height",
    },
    outFields: ["*"],
  });
}

function createPolygonFeatureLayer() {
  return new FeatureLayer({
    id: INDEPENDENT_POLYGON_FEATURE_LAYER_ID,
    title: "Independent Polygons",
    geometryType: "polygon",
    objectIdField: "OBJECTID",
    fields: createFields(),
    source: [],
    popupEnabled: true,
    popupTemplate: createPopupTemplate(),
    renderer: createRenderer([], ["Polygon", "MultiPolygon"]),
    spatialReference: { wkid: 4326 },
    hasZ: true,
    elevationInfo: {
      mode: "absolute-height",
    },
    outFields: ["*"],
  });
}

export function getIndependentLineFeatureLayer(map: Map) {
  return map.findLayerById(
    INDEPENDENT_LINE_FEATURE_LAYER_ID,
  ) as FeatureLayer | null;
}

export function getIndependentPolygonFeatureLayer(map: Map) {
  return map.findLayerById(
    INDEPENDENT_POLYGON_FEATURE_LAYER_ID,
  ) as FeatureLayer | null;
}

export function getOrCreateIndependentLineFeatureLayer(map: Map) {
  const existingLayer = getIndependentLineFeatureLayer(map);

  if (existingLayer) {
    return existingLayer;
  }

  const layer = createLineFeatureLayer();
  map.add(layer);
  return layer;
}

export function getOrCreateIndependentPolygonFeatureLayer(map: Map) {
  const existingLayer = getIndependentPolygonFeatureLayer(map);

  if (existingLayer) {
    return existingLayer;
  }

  const layer = createPolygonFeatureLayer();
  map.add(layer);
  return layer;
}

export function getOrCreateIndependentGeometryFeatureLayers(map: Map) {
  return {
    lineLayer: getOrCreateIndependentLineFeatureLayer(map),
    polygonLayer: getOrCreateIndependentPolygonFeatureLayer(map),
  };
}

export function getIndependentGeometryFeatureLayers(map: Map) {
  return {
    lineLayer: getIndependentLineFeatureLayer(map),
    polygonLayer: getIndependentPolygonFeatureLayer(map),
  };
}

export function clearIndependentGeometryFeatureLayers(map: Map) {
  const { lineLayer, polygonLayer } = getIndependentGeometryFeatureLayers(map);

  lineLayer?.source.removeAll();
  polygonLayer?.source.removeAll();
}

export function renderIndependentPoint(
  feature: IndependentEntityFeature,
  map: Map,
) {
  const point = toMapPoint3D(feature);

  if (!point) return;

  renderPoint(point, map);
}

export function renderIndependentModel3D(
  feature: IndependentEntityFeature,
  map: Map,
) {
  renderIndependentPoint(feature, map);
}

export function renderIndependentEntity(
  feature: IndependentEntityFeature,
  map: Map,
) {
  if (feature.geometry.type === "Point") {
    renderIndependentPoint(feature, map);
    return;
  }

  if (feature.geometry.type === "LineString") {
    const lineLayer = getOrCreateIndependentLineFeatureLayer(map);
    const lineFeature = createLineFeature(feature, getNextObjectId(lineLayer));

    if (lineFeature) {
      lineLayer.source.add(lineFeature);
    }

    return;
  }

  const polygonLayer = getOrCreateIndependentPolygonFeatureLayer(map);
  const polygonFeature = createPolygonFeature(
    feature,
    getNextObjectId(polygonLayer),
  );

  if (polygonFeature) {
    polygonLayer.source.add(polygonFeature);
  }
}

export function renderIndependentEntities(
  features: IndependentEntityFeature[],
  map: Map,
  options: SplitRenderOptions = {},
) {
  clearIndependentGeometryFeatureLayers(map);

  renderPoints(toMapPoint3DList(features, options), map);

  const { lineLayer, polygonLayer } =
    getOrCreateIndependentGeometryFeatureLayers(map);
  const lineFeatures = features
    .map((feature, index) => createLineFeature(feature, index + 1))
    .filter((feature): feature is Graphic => feature !== null);
  const polygonFeatures = features
    .map((feature, index) => createPolygonFeature(feature, index + 1))
    .filter((feature): feature is Graphic => feature !== null);

  lineLayer.renderer = createRenderer(features, ["LineString"], "flat");
  independentLineDisplayModeCache.set(lineLayer, "flat");
  polygonLayer.renderer = createRenderer(features, ["Polygon", "MultiPolygon"]);
  lineLayer.source.addMany(lineFeatures);
  polygonLayer.source.addMany(polygonFeatures);
}

function getLineDisplayMode(scale: number, switchScale: number): LineDisplayMode {
  return scale <= Math.max(1, switchScale) ? "pipe" : "flat";
}

export function syncIndependentLineStringsByScale(
  features: IndependentEntityFeature[],
  map: Map,
  scale: number,
  switchScale: number,
) {
  const lineLayer = getIndependentLineFeatureLayer(map);

  if (!lineLayer) return;

  const mode = getLineDisplayMode(scale, switchScale);

  if (independentLineDisplayModeCache.get(lineLayer) === mode) {
    return;
  }

  lineLayer.renderer = createRenderer(features, ["LineString"], mode);
  independentLineDisplayModeCache.set(lineLayer, mode);
}

export async function queryIndependentGeometryFeatureByEntityId(
  map: Map,
  entityId: string,
) {
  const escapedEntityId = entityId.replace(/'/g, "''");
  const { lineLayer, polygonLayer } = getIndependentGeometryFeatureLayers(map);
  const query = {
    where: `entityId = '${escapedEntityId}'`,
    returnGeometry: true,
    outFields: ["*"],
  };
  const [lineFeatureSet, polygonFeatureSet] = await Promise.all([
    lineLayer ? lineLayer.queryFeatures(query) : Promise.resolve(null),
    polygonLayer ? polygonLayer.queryFeatures(query) : Promise.resolve(null),
  ]);

  return (
    lineFeatureSet?.features[0] ??
    polygonFeatureSet?.features[0] ??
    null
  );
}

export function applyEditedGraphicToIndependentFeature(
  feature: IndependentEntityFeature,
  graphic: Graphic,
): IndependentEntityFeature {
  if (feature.geometry.type === "LineString") {
    const geometry = graphic.geometry as Polyline | null;
    const path = geometry?.paths?.[0] ?? [];

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: path.map(toGeoJsonPosition),
      },
    };
  }

  if (feature.geometry.type === "Polygon") {
    const geometry = graphic.geometry as Polygon | null;

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: (geometry?.rings ?? []).map((ring) =>
          ring.map(toGeoJsonPosition),
        ),
      },
    };
  }

  if (feature.geometry.type === "MultiPolygon") {
    const geometry = graphic.geometry as Polygon | null;

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: [
          (geometry?.rings ?? []).map((ring) => ring.map(toGeoJsonPosition)),
        ],
      },
    };
  }

  return feature;
}
