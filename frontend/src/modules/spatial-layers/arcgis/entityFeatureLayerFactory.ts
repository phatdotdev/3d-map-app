import Graphic, { type GraphicProperties } from "@arcgis/core/Graphic";
import FeatureLayer, {
  type FeatureLayerProperties,
} from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type Layer from "@arcgis/core/layers/Layer";
import type { FieldProperties } from "@arcgis/core/layers/support/Field";

import { SPATIAL_PROPERTIES_JSON_FIELD } from "./graphicAttributes";
import {
  createLineSymbol,
  createPointSymbol,
  createPolygonSymbol,
} from "./symbolFactory";
import {
  queryAllFeatureLayerFeatures,
  replaceFeatureLayerFeatures,
} from "../../../utils/map-render/featureLayerEdits";
import type {
  ParsedSpatialFeature,
  SpatialGeometryType,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";

type GraphicSymbol = NonNullable<GraphicProperties["symbol"]>;
type FeatureLayerRenderer = NonNullable<FeatureLayerProperties["renderer"]>;
type FeatureLayerGeometryType = NonNullable<
  FeatureLayerProperties["geometryType"]
>;

type SpatialEntityLayerMetadata = {
  featureCount: number;
  firstGraphic: Graphic | null;
  graphics: Graphic[];
};

const spatialEntityLayerMetadata = new WeakMap<
  FeatureLayer,
  SpatialEntityLayerMetadata
>();

function sanitizeLayerIdPart(value: string | number) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createSimpleRenderer(symbol: GraphicSymbol): FeatureLayerRenderer {
  return {
    type: "simple",
    symbol,
  } as unknown as FeatureLayerRenderer;
}

function createInitialSymbol(config: SpatialLayerConfig): GraphicSymbol {
  if (config.geometryType === "Point") {
    return createPointSymbol(config);
  }

  if (config.geometryType === "LineString") {
    return createLineSymbol(config);
  }

  return createPolygonSymbol(config);
}

function toFeatureLayerGeometryType(
  geometryType: SpatialGeometryType,
): FeatureLayerGeometryType {
  if (geometryType === "Point") {
    return "point" as FeatureLayerGeometryType;
  }

  if (geometryType === "LineString") {
    return "polyline" as FeatureLayerGeometryType;
  }

  return "polygon" as FeatureLayerGeometryType;
}

function createSpatialFields(): FieldProperties[] {
  return [
    { name: "OBJECTID", alias: "OBJECTID", type: "oid" },
    { name: "id", alias: "ID", type: "string", length: 256 },
    { name: "title", alias: "Title", type: "string", length: 512 },
    {
      name: "sourceLayerId",
      alias: "Source Layer ID",
      type: "string",
      length: 256,
    },
    {
      name: "sourceLayerName",
      alias: "Source Layer Name",
      type: "string",
      length: 512,
    },
    {
      name: "geometryType",
      alias: "Geometry Type",
      type: "string",
      length: 64,
    },
    {
      name: SPATIAL_PROPERTIES_JSON_FIELD,
      alias: "Spatial Properties JSON",
      type: "string",
      length: 8192,
    },
  ];
}

function createPopupTemplate(
  config: SpatialLayerConfig,
): FeatureLayerProperties["popupTemplate"] {
  if (!config.popup?.enabled) {
    return null;
  }

  return {
    title: "{title}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          { fieldName: "id", label: "ID" },
          { fieldName: "sourceLayerName", label: "Layer" },
          { fieldName: "geometryType", label: "Geometry" },
        ],
      },
    ],
  } as FeatureLayerProperties["popupTemplate"];
}

function createElevationInfo(): NonNullable<
  FeatureLayerProperties["elevationInfo"]
> {
  return {
    mode: "absolute-height",
  } as NonNullable<FeatureLayerProperties["elevationInfo"]>;
}

function setSpatialEntityLayerMetadata(
  layer: FeatureLayer,
  graphics: Graphic[],
) {
  spatialEntityLayerMetadata.set(layer, {
    featureCount: graphics.length,
    firstGraphic: graphics[0] ?? null,
    graphics,
  });
}

export function createSpatialEntityLayerId(
  config: SpatialLayerConfig,
  feature: ParsedSpatialFeature,
) {
  return `${config.id}__feature__${sanitizeLayerIdPart(feature.id)}`;
}

export function getSpatialEntityLayerFeatureCount(layer: Layer) {
  if (layer instanceof GraphicsLayer) {
    return layer.graphics.length;
  }

  if (layer instanceof FeatureLayer) {
    return spatialEntityLayerMetadata.get(layer)?.featureCount ?? null;
  }

  return null;
}

export function getSpatialEntityLayerFirstGraphic(layer: Layer) {
  if (layer instanceof GraphicsLayer) {
    return layer.graphics.getItemAt(0) ?? null;
  }

  if (layer instanceof FeatureLayer) {
    return spatialEntityLayerMetadata.get(layer)?.firstGraphic ?? null;
  }

  return null;
}

export function getSpatialEntityFeatureLayerGraphics(layer: FeatureLayer) {
  return spatialEntityLayerMetadata.get(layer)?.graphics ?? [];
}

export async function replaceSpatialEntityFeatureLayerGraphics(
  layer: FeatureLayer,
  graphics: Graphic[],
) {
  const graphicsToAdd = graphics.map((graphic) => graphic.clone());

  await replaceFeatureLayerFeatures(layer, graphicsToAdd);
  setSpatialEntityLayerMetadata(layer, graphicsToAdd);

  return graphicsToAdd.length;
}

export async function syncSpatialEntityFeatureLayerGraphics(
  layer: FeatureLayer,
  nextLayer: FeatureLayer,
) {
  return replaceSpatialEntityFeatureLayerGraphics(
    layer,
    getSpatialEntityFeatureLayerGraphics(nextLayer),
  );
}

export async function clearSpatialEntityLayerGraphics(layer: Layer) {
  if (layer instanceof FeatureLayer) {
    return replaceSpatialEntityFeatureLayerGraphics(layer, []);
  }

  if (layer instanceof GraphicsLayer) {
    if (layer.graphics.length > 0) {
      layer.graphics.removeAll();
    }

    return 0;
  }

  return 0;
}

export async function refreshSpatialEntityFeatureLayerMetadata(
  layer: FeatureLayer,
) {
  const graphics = await queryAllFeatureLayerFeatures(layer);
  setSpatialEntityLayerMetadata(layer, graphics);
  return graphics.length;
}

export function createSpatialEntityGraphicsLayer(
  config: SpatialLayerConfig,
  graphics: Graphic[],
) {
  // The legacy export name is preserved, but spatial entities now use a
  // client-side FeatureLayer so zoom-mode symbol changes are renderer updates.
  const layer = new FeatureLayer({
    id: config.id,
    title: config.name,
    visible: config.visible,
    minScale: config.display.minScale,
    maxScale: config.display.maxScale,
    geometryType: toFeatureLayerGeometryType(config.geometryType),
    objectIdField: "OBJECTID",
    fields: createSpatialFields(),
    source: graphics,
    renderer: createSimpleRenderer(createInitialSymbol(config)),
    popupEnabled: Boolean(config.popup?.enabled),
    popupTemplate: createPopupTemplate(config),
    spatialReference: { wkid: 4326 },
    hasZ: true,
    elevationInfo: createElevationInfo(),
    outFields: ["*"],
  });

  setSpatialEntityLayerMetadata(layer, graphics);
  return layer;
}

export function applySpatialGraphicSymbol(
  graphic: Graphic,
  symbol: GraphicSymbol,
) {
  graphic.symbol = symbol;
}
