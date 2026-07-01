import Map from "@arcgis/core/Map";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import FeatureLayer, {
  type FeatureLayerProperties,
} from "@arcgis/core/layers/FeatureLayer";
import type { FieldProperties } from "@arcgis/core/layers/support/Field";

import type { MapPoint3D } from "../../features/map/types/mapPoint";
import type { ModelTransformState } from "../../features/map/types/modelEditing";
import {
  clearFeatureLayerFeatures,
  enqueueFeatureLayerEdit,
  queryAllFeatureLayerFeatures,
  queryNextFeatureLayerObjectId,
  replaceFeatureLayerFeatures,
} from "./featureLayerEdits";
import { createMapPinSvgDataUrl } from "./mapPinSvg";

export const PIN_FEATURE_LAYER_ID = "map-point-pin-layer";
export const MODEL_FEATURE_LAYER_ID = "map-point-model-layer";

const DEFAULT_PIN_ICON_URL = "/icons/map-pin.svg";
const DEFAULT_PIN_COLOR = "#ef4444";
const DEFAULT_SHOW_MODEL_AT_SCALE = 5000;
const DEFAULT_MODEL_SIZE = 20;
const DEFAULT_MODEL_ROTATION = 0;
const WGS84_SPATIAL_REFERENCE = new SpatialReference({ wkid: 4326 });

type RenderType = "pin" | "model";
type FeatureLayerRenderer = NonNullable<FeatureLayerProperties["renderer"]>;

export type PointFeatureAttributes = {
  OBJECTID: number;
  pointId: string;
  symbolKey: string;
  name: string;
  renderType: RenderType;
  pinEnabled: number;
  modelEnabled: number;
  showModelAtScale: number;
  SIZE: number;
  ROTATION: number;
  TILT: number;
  ROLL: number;
  MODEL_URL: string;
  ELEVATION: number;
};

type PopupFieldInfo = {
  fieldName: string;
  label: string;
};

type PopupTemplateJson = {
  title: string;
  content: Array<{
    type: "fields";
    fieldInfos: PopupFieldInfo[];
  }>;
};

type PointSymbol3DJson = {
  type: "point-3d";
  symbolLayers: Array<Record<string, unknown>>;
  callout?: {
    type: "line";
    color: string;
    size: number;
  };
};

type RendererVisualVariableJson =
  | {
    type: "size";
    field: "SIZE";
    axis: "width" | "depth" | "height" | "width-and-depth" | "all";
    valueUnit: "meters";
  }
  | {
    type: "rotation";
    field: "ROTATION" | "TILT" | "ROLL";
    axis?: "heading" | "tilt" | "roll";
  };

type UniqueValueInfoJson = {
  value: string;
  label: string;
  symbol: PointSymbol3DJson;
};

type UniqueValueRendererJson = {
  type: "unique-value";
  field: "symbolKey";
  defaultSymbol?: PointSymbol3DJson;
  uniqueValueInfos: UniqueValueInfoJson[];
  visualVariables?: RendererVisualVariableJson[];
};

// type BuildModelTransformStateOptions = {
//   preferSymbolRotation?: boolean;
// };

function createPointGeometry(point: MapPoint3D) {
  return new Point({
    longitude: point.longitude,
    latitude: point.latitude,
    z: point.z ?? 0,
    spatialReference: { wkid: 4326 },
  });
}

function createPointFields(): FieldProperties[] {
  return [
    { name: "OBJECTID", alias: "OBJECTID", type: "oid" },
    { name: "pointId", alias: "Point ID", type: "string" },
    { name: "symbolKey", alias: "Symbol Key", type: "string" },
    { name: "name", alias: "Name", type: "string" },
    { name: "renderType", alias: "Render Type", type: "string" },
    { name: "pinEnabled", alias: "Pin Enabled", type: "small-integer" },
    { name: "modelEnabled", alias: "Model Enabled", type: "small-integer" },
    {
      name: "showModelAtScale",
      alias: "Show Model At Scale",
      type: "integer",
    },
    { name: "SIZE", alias: "Size", type: "double" },
    { name: "ROTATION", alias: "Rotation", type: "double" },
    { name: "TILT", alias: "Tilt", type: "double" },
    { name: "ROLL", alias: "Roll", type: "double" },
    { name: "MODEL_URL", alias: "Model URL", type: "string" },
    { name: "ELEVATION", alias: "Elevation", type: "double" },
  ];
}

function createPopupTemplate(): PopupTemplateJson {
  return {
    title: "{name}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          { fieldName: "pointId", label: "Point ID" },
          { fieldName: "name", label: "Name" },
          { fieldName: "renderType", label: "Render Type" },
          { fieldName: "MODEL_URL", label: "Model URL" },
          { fieldName: "SIZE", label: "Scale" },
          { fieldName: "ROTATION", label: "Heading" },
          { fieldName: "TILT", label: "Tilt" },
          { fieldName: "ROLL", label: "Roll" },
          { fieldName: "ELEVATION", label: "Elevation" },
        ],
      },
    ],
  };
}

function createPinRenderer(): UniqueValueRendererJson {
  return {
    type: "unique-value",
    field: "symbolKey",
    uniqueValueInfos: [],
  };
}

function createModelRenderer(): UniqueValueRendererJson {
  return {
    type: "unique-value",
    field: "symbolKey",
    uniqueValueInfos: [],
    visualVariables: [
      {
        type: "size",
        field: "SIZE",
        axis: "height",
        valueUnit: "meters",
      },
      {
        type: "rotation",
        field: "ROTATION",
        axis: "heading",
      },
      {
        type: "rotation",
        field: "TILT",
        axis: "tilt",
      },
      {
        type: "rotation",
        field: "ROLL",
        axis: "roll",
      },
    ],
  };
}

function toFeatureLayerRenderer(
  renderer: UniqueValueRendererJson,
): FeatureLayerRenderer {
  return renderer as unknown as FeatureLayerRenderer;
}

function createPinFeatureLayer() {
  return new FeatureLayer({
    id: PIN_FEATURE_LAYER_ID,
    title: "Spatial Pins",
    geometryType: "point",
    objectIdField: "OBJECTID",
    fields: createPointFields(),
    source: [],
    popupEnabled: true,
    popupTemplate: createPopupTemplate(),
    renderer: toFeatureLayerRenderer(createPinRenderer()),
    spatialReference: { wkid: 4326 },
    hasZ: true,
    elevationInfo: {
      mode: "absolute-height",
    },
    outFields: ["*"],
  });
}

function createModelFeatureLayer() {
  return new FeatureLayer({
    id: MODEL_FEATURE_LAYER_ID,
    title: "Spatial Models",
    geometryType: "point",
    objectIdField: "OBJECTID",
    fields: createPointFields(),
    source: [],
    popupEnabled: true,
    popupTemplate: createPopupTemplate(),
    renderer: toFeatureLayerRenderer(createModelRenderer()),
    spatialReference: { wkid: 4326 },
    hasZ: true,
    elevationInfo: {
      mode: "absolute-height",
    },
    outFields: ["*"],
  });
}

function getOrCreatePinFeatureLayer(map: Map) {
  const existingLayer = map.findLayerById(
    PIN_FEATURE_LAYER_ID,
  ) as FeatureLayer | null;

  if (existingLayer) {
    return existingLayer;
  }

  const pinLayer = createPinFeatureLayer();
  map.add(pinLayer);

  return pinLayer;
}

function getOrCreateModelFeatureLayer(map: Map) {
  const existingLayer = map.findLayerById(
    MODEL_FEATURE_LAYER_ID,
  ) as FeatureLayer | null;

  if (existingLayer) {
    return existingLayer;
  }

  const modelLayer = createModelFeatureLayer();
  map.add(modelLayer);

  return modelLayer;
}

function getModelScale(point: MapPoint3D) {
  return toPositiveFiniteNumber(
    point.model3D?.scale,
    toPositiveFiniteNumber(
      point.model3D?.height,
      toPositiveFiniteNumber(
        point.model3D?.width,
        toPositiveFiniteNumber(point.model3D?.depth, DEFAULT_MODEL_SIZE),
      ),
    ),
  );
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function getModelRotation(point: MapPoint3D) {
  return normalizeAngle(point.model3D?.heading ?? DEFAULT_MODEL_ROTATION);
}

function numbersEqual(first: number, second: number) {
  return Math.abs(first - second) < 0.000001;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toFiniteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toPositiveFiniteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
}

function buildPointAttributes(
  point: MapPoint3D,
  renderType: RenderType,
  objectId: number,
): PointFeatureAttributes {
  return {
    OBJECTID: objectId,
    pointId: point.id,
    symbolKey: `${renderType}:${point.id}`,
    name: point.name,
    renderType,
    pinEnabled: (point.pin?.enabled ?? true) ? 1 : 0,
    modelEnabled: (point.model3D?.enabled ?? false) ? 1 : 0,
    showModelAtScale:
      point.model3D?.showModelAtScale ?? DEFAULT_SHOW_MODEL_AT_SCALE,
    SIZE: getModelScale(point),
    ROTATION: getModelRotation(point),
    TILT: point.model3D?.tilt ?? 0,
    ROLL: point.model3D?.roll ?? 0,
    MODEL_URL: point.model3D?.url ?? "",
    ELEVATION: point.z ?? 0,
  };
}

function resolvePinIconHref(point: MapPoint3D) {
  const iconUrl = point.pin?.iconUrl ?? DEFAULT_PIN_ICON_URL;
  const pinColor = point.pin?.color ?? DEFAULT_PIN_COLOR;

  if (iconUrl === DEFAULT_PIN_ICON_URL) {
    return createMapPinSvgDataUrl(pinColor);
  }

  return iconUrl;
}

function createPinSymbol(point: MapPoint3D): PointSymbol3DJson {
  return {
    type: "point-3d",
    symbolLayers: [
      {
        type: "icon",
        resource: {
          href: resolvePinIconHref(point),
        },
        material: {
          color: point.pin?.color ?? DEFAULT_PIN_COLOR,
        },
        size: point.pin?.size ?? 32,
        outline: {
          color: "#ffffff",
          size: 1,
        },
      },
    ],
    callout: {
      type: "line",
      color: "#ffffff",
      size: 1,
    },
  };
}

function createModelSymbol(point: MapPoint3D): PointSymbol3DJson {
  return {
    type: "point-3d",
    symbolLayers: [
      {
        type: "object",
        resource: {
          href: point.model3D?.url ?? "",
        },
        anchor: "bottom",
        height: getModelScale(point),
      },
    ],
  };
}

function upsertRendererSymbol(
  layer: FeatureLayer,
  symbolKey: string,
  symbol: PointSymbol3DJson,
) {
  const renderer = layer.renderer as unknown as UniqueValueRendererJson | null;
  const currentInfos =
    renderer?.type === "unique-value"
      ? (renderer.uniqueValueInfos ?? []).map((info) => ({
        value: String(info.value ?? ""),
        label: info.label ?? String(info.value ?? ""),
        symbol: (info.symbol ?? symbol) as PointSymbol3DJson,
      }))
      : [];
  const visualVariables =
    renderer?.type === "unique-value" ? renderer.visualVariables : undefined;
  const nextInfo = {
    value: symbolKey,
    label: symbolKey,
    symbol,
  };
  const existingIndex = currentInfos.findIndex(
    (info) => info.value === symbolKey,
  );

  if (existingIndex >= 0) {
    currentInfos[existingIndex] = nextInfo;
  } else {
    currentInfos.push(nextInfo);
  }

  layer.renderer = {
    type: "unique-value",
    field: "symbolKey",
    defaultSymbol: symbol,
    uniqueValueInfos: currentInfos,
    visualVariables,
  } as unknown as FeatureLayerRenderer;
}

function createFeatureGraphic(
  geometry: Point,
  attributes: PointFeatureAttributes,
) {
  return new Graphic({
    geometry,
    attributes,
    popupTemplate: createPopupTemplate(),
  });
}

async function addPinFeature(point: MapPoint3D, map: Map, geometry: Point) {
  const pinLayer = getOrCreatePinFeatureLayer(map);

  await enqueueFeatureLayerEdit(pinLayer, async () => {
    const objectId = await queryNextFeatureLayerObjectId(pinLayer);
    const attributes = buildPointAttributes(point, "pin", objectId);

    upsertRendererSymbol(
      pinLayer,
      attributes.symbolKey,
      createPinSymbol(point),
    );
    await pinLayer.applyEdits({
      addFeatures: [createFeatureGraphic(geometry, attributes)],
    });
  });
}

async function addModelFeature(point: MapPoint3D, map: Map, geometry: Point) {
  if (!point.model3D?.enabled) return;

  const modelLayer = getOrCreateModelFeatureLayer(map);

  await enqueueFeatureLayerEdit(modelLayer, async () => {
    const objectId = await queryNextFeatureLayerObjectId(modelLayer);
    const attributes = buildPointAttributes(point, "model", objectId);

    upsertRendererSymbol(
      modelLayer,
      attributes.symbolKey,
      createModelSymbol(point),
    );
    await modelLayer.applyEdits({
      addFeatures: [createFeatureGraphic(geometry, attributes)],
    });
  });
}

function buildPinDefinitionExpression(scale: number) {
  return [
    "pinEnabled = 1",
    `(modelEnabled = 0 OR showModelAtScale <= ${scale})`,
  ].join(" AND ");
}

function buildModelDefinitionExpression(scale: number) {
  return ["modelEnabled = 1", `showModelAtScale > ${scale}`].join(" AND ");
}

function getModelAttributes(feature: Graphic) {
  return feature.attributes as Partial<PointFeatureAttributes>;
}

function getSymbolLayerNumber(feature: Graphic, propertyName: string) {
  const symbol = feature.symbol as
    | {
      symbolLayers?:
      | Array<Record<string, unknown>>
      | {
        at?: (index: number) => Record<string, unknown> | undefined;
        getItemAt?: (
          index: number,
        ) => Record<string, unknown> | undefined;
      };
    }
    | null
    | undefined;
  const symbolLayers = symbol?.symbolLayers;
  const layer = Array.isArray(symbolLayers)
    ? symbolLayers[0]
    : (symbolLayers?.at?.(0) ?? symbolLayers?.getItemAt?.(0));
  const value = layer?.[propertyName];
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function getGeographicCoordinates(
  geometry: Point | null,
  fallbackPoint?: MapPoint3D,
) {
  if (!geometry) {
    return {
      longitude: fallbackPoint?.longitude ?? 0,
      latitude: fallbackPoint?.latitude ?? 0,
      z: undefined,
    };
  }

  const geographicGeometry = webMercatorUtils.canProject(
    geometry,
    WGS84_SPATIAL_REFERENCE,
  )
    ? (webMercatorUtils.project(geometry, WGS84_SPATIAL_REFERENCE) as Point)
    : geometry;

  const z =
    typeof geographicGeometry.z === "number" &&
      Number.isFinite(geographicGeometry.z)
      ? geographicGeometry.z
      : undefined;

  return {
    longitude:
      geographicGeometry.longitude ??
      geographicGeometry.x ??
      fallbackPoint?.longitude ??
      0,
    latitude:
      geographicGeometry.latitude ??
      geographicGeometry.y ??
      fallbackPoint?.latitude ??
      0,
    z,
  };
}

function resolveModelElevation(
  geometryElevation: number | undefined,
  attributes: Partial<PointFeatureAttributes>,
  fallbackPoint?: MapPoint3D,
) {
  const attributeElevation = Number(attributes.ELEVATION);
  const savedElevation = Number.isFinite(attributeElevation)
    ? attributeElevation
    : isFiniteNumber(fallbackPoint?.z)
      ? fallbackPoint.z
      : undefined;

  if (isFiniteNumber(geometryElevation)) {
    if (
      numbersEqual(geometryElevation, 0) &&
      isFiniteNumber(savedElevation) &&
      !numbersEqual(savedElevation, 0)
    ) {
      return savedElevation;
    }

    return geometryElevation;
  }

  return savedElevation ?? 0;
}

async function updateModelSwitchScaleOnLayer(
  layer: FeatureLayer | null,
  modelSwitchScale: number,
) {
  if (!layer) return;

  const nextScale = Math.max(1, Math.round(modelSwitchScale));

  await enqueueFeatureLayerEdit(layer, async () => {
    const features = await queryAllFeatureLayerFeatures(layer);
    const updates = features
      .filter(
        (feature) =>
          Number(feature.attributes?.showModelAtScale ?? 0) !== nextScale,
      )
      .map(
        (feature) =>
          new Graphic({
            geometry: feature.geometry,
            attributes: {
              ...feature.attributes,
              showModelAtScale: nextScale,
            },
          }),
      );

    if (updates.length === 0) {
      return;
    }

    await layer.applyEdits({
      updateFeatures: updates,
    });
  });
}

export async function applyTransformToModelFeatureLayer(
  modelLayer: FeatureLayer,
  transform: ModelTransformState,
) {
  await enqueueFeatureLayerEdit(modelLayer, async () => {
    const feature = await queryModelFeatureByPointId(
      modelLayer,
      transform.pointId,
    );

    if (!feature) return;

    const normalizedHeading = ((transform.heading % 360) + 360) % 360;

    await modelLayer.applyEdits({
      updateFeatures: [
        new Graphic({
          geometry: new Point({
            longitude: transform.longitude,
            latitude: transform.latitude,
            z: transform.elevation,
            spatialReference: { wkid: 4326 },
          }),
          attributes: {
            ...feature.attributes,
            MODEL_URL: transform.modelUrl,
            SIZE: transform.scale,
            ROTATION: normalizedHeading,
            TILT: transform.tilt,
            ROLL: transform.roll,
            ELEVATION: transform.elevation,
          },
        }),
      ],
    });
  });
}

export function buildModelTransformState(
  feature: Graphic,
  point?: MapPoint3D,
  // options: BuildModelTransformStateOptions = {},
): ModelTransformState {
  const geometry = feature.geometry as Point | null;
  const attributes = getModelAttributes(feature);
  const fallbackSize = point ? getModelScale(point) : DEFAULT_MODEL_SIZE;
  const fallbackHeading = point
    ? getModelRotation(point)
    : DEFAULT_MODEL_ROTATION;
  const size = toPositiveFiniteNumber(
    attributes.SIZE ?? feature.attributes?.MODEL_HEIGHT,
    fallbackSize,
  );
  const coordinates = getGeographicCoordinates(geometry, point);
  const elevation = resolveModelElevation(coordinates.z, attributes, point);

  const attributeHeading = Number(attributes.ROTATION);
  const symbolHeading = getSymbolLayerNumber(feature, "heading");
  const resolvedHeading =
    symbolHeading ??
    (Number.isFinite(attributeHeading) ? attributeHeading : fallbackHeading);
  const normalizedHeading = ((resolvedHeading % 360) + 360) % 360;

  const attributeTilt = Number(attributes.TILT);
  const symbolTilt = getSymbolLayerNumber(feature, "tilt");
  const fallbackTilt = point?.model3D?.tilt ?? 0;
  const resolvedTilt =
    symbolTilt ??
    (Number.isFinite(attributeTilt) ? attributeTilt : fallbackTilt);

  const attributeRoll = Number(attributes.ROLL);
  const symbolRoll = getSymbolLayerNumber(feature, "roll");
  const fallbackRoll = point?.model3D?.roll ?? 0;
  const resolvedRoll =
    symbolRoll ??
    (Number.isFinite(attributeRoll) ? attributeRoll : fallbackRoll);

  return {
    pointId: String(attributes.pointId ?? point?.id ?? ""),
    objectId: Number(attributes.OBJECTID ?? 0),
    name: String(attributes.name ?? point?.name ?? ""),
    modelUrl: String(attributes.MODEL_URL ?? point?.model3D?.url ?? ""),
    longitude: coordinates.longitude,
    latitude: coordinates.latitude,
    elevation,
    heading: normalizedHeading,
    tilt: resolvedTilt,
    roll: resolvedRoll,
    scale: size,
  };
}

export function buildPointFromTransformState(
  transform: ModelTransformState,
  currentPoint: MapPoint3D,
): MapPoint3D {
  return {
    ...currentPoint,
    longitude: transform.longitude,
    latitude: transform.latitude,
    z: transform.elevation,
    model3D: currentPoint.model3D
      ? {
        ...currentPoint.model3D,
        url: transform.modelUrl,
        scale: transform.scale,
        width: undefined,
        depth: undefined,
        height: undefined,
        heading: transform.heading,
        tilt: transform.tilt,
        roll: transform.roll,
      }
      : currentPoint.model3D,
  };
}

export function syncPointFeatureLayersVisibility(map: Map, scale: number) {
  const safeScale = Math.max(1, Math.round(scale));
  const pinLayer = map.findLayerById(
    PIN_FEATURE_LAYER_ID,
  ) as FeatureLayer | null;
  const modelLayer = map.findLayerById(
    MODEL_FEATURE_LAYER_ID,
  ) as FeatureLayer | null;

  if (pinLayer) {
    pinLayer.definitionExpression = buildPinDefinitionExpression(safeScale);
  }

  if (modelLayer) {
    modelLayer.definitionExpression = buildModelDefinitionExpression(safeScale);
  }
}

export async function updatePointFeatureLayersModelSwitchScale(
  map: Map,
  modelSwitchScale: number,
) {
  const pinLayer = getPinFeatureLayer(map);
  const modelLayer = getModelFeatureLayer(map);

  await Promise.all([
    updateModelSwitchScaleOnLayer(pinLayer, modelSwitchScale),
    updateModelSwitchScaleOnLayer(modelLayer, modelSwitchScale),
  ]);
}

export function getPinFeatureLayer(map: Map) {
  return map.findLayerById(PIN_FEATURE_LAYER_ID) as FeatureLayer | null;
}

export function getModelFeatureLayer(map: Map) {
  return map.findLayerById(MODEL_FEATURE_LAYER_ID) as FeatureLayer | null;
}

export function ensurePointFeatureLayers(map: Map) {
  return {
    pinLayer: getOrCreatePinFeatureLayer(map),
    modelLayer: getOrCreateModelFeatureLayer(map),
  };
}

export async function clearPointFeatureLayers(map: Map) {
  const pinLayer = getPinFeatureLayer(map);
  const modelLayer = getModelFeatureLayer(map);

  await Promise.all([
    clearFeatureLayerFeatures(pinLayer),
    clearFeatureLayerFeatures(modelLayer),
  ]);
}

export async function renderPoints(points: MapPoint3D[], map: Map) {
  const pinLayer = getOrCreatePinFeatureLayer(map);
  const modelLayer = getOrCreateModelFeatureLayer(map);
  const pinGraphics: Graphic[] = [];
  const modelGraphics: Graphic[] = [];
  const pinInfos: UniqueValueInfoJson[] = [];
  const modelInfos: UniqueValueInfoJson[] = [];
  let pinObjectId = 1;
  let modelObjectId = 1;

  points.forEach((point) => {
    const geometry = createPointGeometry(point);
    const pinAttributes = buildPointAttributes(point, "pin", pinObjectId);
    const pinSymbol = createPinSymbol(point);

    pinObjectId += 1;
    pinInfos.push({
      value: pinAttributes.symbolKey,
      label: pinAttributes.symbolKey,
      symbol: pinSymbol,
    });
    pinGraphics.push(createFeatureGraphic(geometry, pinAttributes));

    if (!point.model3D?.enabled) return;

    const modelAttributes = buildPointAttributes(point, "model", modelObjectId);
    const modelSymbol = createModelSymbol(point);

    modelObjectId += 1;
    modelInfos.push({
      value: modelAttributes.symbolKey,
      label: modelAttributes.symbolKey,
      symbol: modelSymbol,
    });
    modelGraphics.push(createFeatureGraphic(geometry, modelAttributes));
  });

  pinLayer.renderer = toFeatureLayerRenderer({
    ...createPinRenderer(),
    defaultSymbol: pinInfos[0]?.symbol,
    uniqueValueInfos: pinInfos,
  });
  modelLayer.renderer = toFeatureLayerRenderer({
    ...createModelRenderer(),
    defaultSymbol: modelInfos[0]?.symbol,
    uniqueValueInfos: modelInfos,
  });
  await Promise.all([
    replaceFeatureLayerFeatures(pinLayer, pinGraphics),
    replaceFeatureLayerFeatures(modelLayer, modelGraphics),
  ]);
}

export async function queryFeatureByPointId(
  layer: FeatureLayer,
  pointId: string,
) {
  const featureSet = await layer.queryFeatures({
    where: `pointId = '${pointId.replace(/'/g, "''")}'`,
    returnGeometry: true,
    outFields: ["*"],
  });

  return featureSet.features[0] ?? null;
}

export async function queryFeatureByPointIdOrSplitChild(
  layer: FeatureLayer,
  pointId: string,
) {
  const exactFeature = await queryFeatureByPointId(layer, pointId);

  if (exactFeature) {
    return exactFeature;
  }

  const escapedPointId = pointId.replace(/'/g, "''");
  const featureSet = await layer.queryFeatures({
    where: `pointId LIKE '${escapedPointId}:%'`,
    returnGeometry: true,
    outFields: ["*"],
  });

  return featureSet.features[0] ?? null;
}

export async function queryModelFeatureByPointId(
  modelLayer: FeatureLayer,
  pointId: string,
) {
  return queryFeatureByPointId(modelLayer, pointId);
}

export async function queryModelFeatureByObjectId(
  modelLayer: FeatureLayer,
  objectId: number,
) {
  const featureSet = await modelLayer.queryFeatures({
    objectIds: [objectId],
    returnGeometry: true,
    outFields: ["*"],
  });

  return featureSet.features[0] ?? null;
}

async function queryCurrentModelFeatures(modelLayer: FeatureLayer) {
  const featureSet = await modelLayer.queryFeatures({
    where: "1=1",
    returnGeometry: true,
    outFields: ["*"],
  });

  return featureSet.features.map((feature) =>
    buildModelTransformState(feature),
  );
}

export async function syncModelLayerEdits(modelLayer: FeatureLayer) {
  return enqueueFeatureLayerEdit(modelLayer, async () => {
    const featureSet = await modelLayer.queryFeatures({
      where: "1=1",
      returnGeometry: true,
      outFields: ["*"],
    });

    const updates = featureSet.features
      .map((feature) => {
        const geometry = feature.geometry as Point | null;
        const geometryElevation =
          typeof geometry?.z === "number" && Number.isFinite(geometry.z)
            ? geometry.z
            : undefined;
        const currentElevation = toFiniteNumber(
          feature.attributes?.ELEVATION,
          0,
        );
        const nextElevation = resolveModelElevation(
          geometryElevation,
          feature.attributes as Partial<PointFeatureAttributes>,
        );
        const nextSize = toPositiveFiniteNumber(
          feature.attributes?.SIZE ?? feature.attributes?.MODEL_HEIGHT,
          DEFAULT_MODEL_SIZE,
        );
        const nextRotation = Number(
          feature.attributes?.ROTATION ?? DEFAULT_MODEL_ROTATION,
        );

        if (
          numbersEqual(currentElevation, nextElevation) &&
          numbersEqual(
            toFiniteNumber(feature.attributes?.SIZE, nextSize),
            nextSize,
          ) &&
          numbersEqual(
            Number(feature.attributes?.ROTATION ?? nextRotation),
            nextRotation,
          )
        ) {
          return null;
        }

        return new Graphic({
          geometry,
          attributes: {
            ...feature.attributes,
            ELEVATION: nextElevation,
            SIZE: nextSize,
            ROTATION: nextRotation,
          },
        });
      })
      .filter((feature): feature is Graphic => feature !== null);

    if (updates.length > 0) {
      await modelLayer.applyEdits({
        updateFeatures: updates,
      });
    }

    const currentFeatures = await queryCurrentModelFeatures(modelLayer);
    console.log("Updated model features:", currentFeatures);

    return currentFeatures;
  });
}

export async function deletePointFeatures(map: Map, pointId: string) {
  const pinLayer = getPinFeatureLayer(map);
  const modelLayer = getModelFeatureLayer(map);

  await Promise.all([
    pinLayer
      ? enqueueFeatureLayerEdit(pinLayer, async () => {
        const pinFeature = await queryFeatureByPointId(pinLayer, pointId);

        if (pinFeature) {
          await pinLayer.applyEdits({
            deleteFeatures: [pinFeature],
          });
        }
      })
      : Promise.resolve(),
    modelLayer
      ? enqueueFeatureLayerEdit(modelLayer, async () => {
        const modelFeature = await queryModelFeatureByPointId(
          modelLayer,
          pointId,
        );

        if (modelFeature) {
          await modelLayer.applyEdits({
            deleteFeatures: [modelFeature],
          });
        }
      })
      : Promise.resolve(),
  ]);
}

export async function renderPoint(point: MapPoint3D, map: Map) {
  const geometry = createPointGeometry(point);

  await Promise.all([
    addPinFeature(point, map, geometry),
    addModelFeature(point, map, geometry),
  ]);
}
