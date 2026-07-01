import Graphic, { type GraphicProperties } from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import type {
  ParsedSpatialFeature,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";

type GraphicSymbol = NonNullable<GraphicProperties["symbol"]>;

function sanitizeLayerIdPart(value: string | number) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function createSpatialEntityLayerId(
  config: SpatialLayerConfig,
  feature: ParsedSpatialFeature,
) {
  return `${config.id}__feature__${sanitizeLayerIdPart(feature.id)}`;
}

export function createSpatialEntityGraphicsLayer(
  config: SpatialLayerConfig,
  graphics: Graphic[],
) {
  return new GraphicsLayer({
    id: config.id,
    title: config.name,
    visible: config.visible,
    minScale: config.display.minScale,
    maxScale: config.display.maxScale,
    elevationInfo: {
      mode: "absolute-height",
    },
    graphics,
  });
}

export function applySpatialGraphicSymbol(
  graphic: Graphic,
  symbol: GraphicSymbol,
) {
  graphic.symbol = symbol;
}
