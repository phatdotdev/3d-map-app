import type { GraphicProperties } from "@arcgis/core/Graphic";
import type Layer from "@arcgis/core/layers/Layer";
import FeatureLayer, {
  type FeatureLayerProperties,
} from "@arcgis/core/layers/FeatureLayer";
import GroupLayer from "@arcgis/core/layers/GroupLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import {
  createLineFlatSymbol,
  createLinePipeSymbol,
  createPointIconSymbol,
  createPointModelSymbol,
} from "./symbolFactory";
import type {
  SpatialLayerConfig,
  SpatialPointDisplayMode,
} from "../types/spatial-layer.types";

type GraphicSymbol = NonNullable<GraphicProperties["symbol"]>;
type FeatureLayerRenderer = NonNullable<FeatureLayerProperties["renderer"]>;
type LayerDisplayMode = SpatialPointDisplayMode | "line-flat" | "line-pipe";
type LayerDisplayState = {
  mode: LayerDisplayMode;
  graphicCount: number | null;
  firstGraphic: object | null;
};

const layerDisplayStateCache = new WeakMap<Layer, LayerDisplayState>();

function createSimpleRenderer(symbol: GraphicSymbol): FeatureLayerRenderer {
  return {
    type: "simple",
    symbol,
  } as unknown as FeatureLayerRenderer;
}

function getFeatureLayers(layer: Layer): FeatureLayer[] {
  if (layer instanceof FeatureLayer) {
    return [layer];
  }

  if (layer instanceof GroupLayer) {
    return layer.layers
      .toArray()
      .flatMap((childLayer) => getFeatureLayers(childLayer));
  }

  return [];
}

function applyLayerSymbol(layer: Layer, symbol: GraphicSymbol) {
  if (layer instanceof GraphicsLayer) {
    layer.graphics.forEach((graphic) => {
      graphic.symbol = symbol;
    });
    return;
  }

  getFeatureLayers(layer).forEach((featureLayer) => {
    featureLayer.renderer = createSimpleRenderer(symbol);
  });
}

function getLayerGraphicCount(layer: Layer) {
  return layer instanceof GraphicsLayer ? layer.graphics.length : null;
}

function getLayerFirstGraphic(layer: Layer) {
  return layer instanceof GraphicsLayer
    ? (layer.graphics.toArray()[0] ?? null)
    : null;
}

function hasCachedDisplayState(layer: Layer, mode: LayerDisplayMode) {
  const state = layerDisplayStateCache.get(layer);

  return (
    state?.mode === mode &&
    state.graphicCount === getLayerGraphicCount(layer) &&
    state.firstGraphic === getLayerFirstGraphic(layer)
  );
}

function cacheDisplayState(layer: Layer, mode: LayerDisplayMode) {
  layerDisplayStateCache.set(layer, {
    mode,
    graphicCount: getLayerGraphicCount(layer),
    firstGraphic: getLayerFirstGraphic(layer),
  });
}

export function applyPointZoomRule(
  layer: Layer,
  config: SpatialLayerConfig,
  scale: number,
  switchScaleOverride?: number,
) {
  if (config.geometryType !== "Point") return;

  const zoomRule = config.display.zoomRule;
  const model = config.display.model;
  const fallbackMode =
    config.display.mode === "model" && model?.enabled ? "model" : "icon";

  if (!zoomRule?.enabled || !model?.enabled) {
    if (hasCachedDisplayState(layer, fallbackMode)) {
      return;
    }

    applyLayerSymbol(
      layer,
      fallbackMode === "model"
        ? createPointModelSymbol(config)
        : createPointIconSymbol(config),
    );
    cacheDisplayState(layer, fallbackMode);
    return;
  }

  const switchScale = Math.max(
    1,
    Math.round(switchScaleOverride ?? zoomRule.switchToModelScale),
  );
  const shouldUseModel = scale <= switchScale;
  const nextMode = shouldUseModel ? zoomRule.nearMode : zoomRule.farMode;

  if (hasCachedDisplayState(layer, nextMode)) {
    return;
  }

  applyLayerSymbol(
    layer,
    nextMode === "model"
      ? createPointModelSymbol(config)
      : createPointIconSymbol(config),
  );
  cacheDisplayState(layer, nextMode);
}

export function applyLineZoomRule(
  layer: Layer,
  config: SpatialLayerConfig,
  scale: number,
  switchScaleOverride?: number,
) {
  if (config.geometryType !== "LineString") return;

  const switchScale = Math.max(
    1,
    Math.round(switchScaleOverride ?? config.display.zoomRule?.switchToModelScale ?? 3000),
  );
  const shouldUsePipe = scale <= switchScale;
  const nextMode: LayerDisplayMode = shouldUsePipe ? "line-pipe" : "line-flat";

  if (hasCachedDisplayState(layer, nextMode)) {
    return;
  }

  applyLayerSymbol(
    layer,
    shouldUsePipe ? createLinePipeSymbol(config) : createLineFlatSymbol(config),
  );
  cacheDisplayState(layer, nextMode);
}

export function applySpatialZoomRules(
  layer: Layer,
  config: SpatialLayerConfig,
  scale: number,
  switchScaleOverride?: number,
) {
  applyPointZoomRule(layer, config, scale, switchScaleOverride);
  applyLineZoomRule(layer, config, scale, switchScaleOverride);
}
