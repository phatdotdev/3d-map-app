import type { GraphicProperties } from "@arcgis/core/Graphic";
import FeatureLayer, {
  type FeatureLayerProperties,
} from "@arcgis/core/layers/FeatureLayer";
import GroupLayer from "@arcgis/core/layers/GroupLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type Layer from "@arcgis/core/layers/Layer";

import {
  getSpatialEntityLayerFeatureCount,
  getSpatialEntityLayerFirstGraphic,
} from "./entityFeatureLayerFactory";
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
type FeatureReduction = NonNullable<FeatureLayerProperties["featureReduction"]>;
type LayerDisplayMode = SpatialPointDisplayMode | "line-flat" | "line-pipe";
type LayerDisplayState = {
  mode: LayerDisplayMode;
  graphicCount: number | null;
  firstGraphic: object | null;
};

const GRAPHICS_LAYER_SYMBOL_BATCH_SIZE = 400;
const FEATURE_REDUCTION_MIN_FEATURES = 250;
const layerDisplayStateCache = new WeakMap<Layer, LayerDisplayState>();
const graphicsLayerBatchVersions = new WeakMap<GraphicsLayer, number>();

function createSimpleRenderer(symbol: GraphicSymbol): FeatureLayerRenderer {
  return {
    type: "simple",
    symbol,
  } as unknown as FeatureLayerRenderer;
}

function createSceneFeatureReduction(): FeatureReduction {
  return {
    type: "selection",
  } as FeatureReduction;
}

function getFeatureLayers(layer: Layer): FeatureLayer[] {
  if (layer instanceof FeatureLayer) {
    return [layer];
  }

  if (layer instanceof GroupLayer) {
    const featureLayers: FeatureLayer[] = [];

    layer.layers.forEach((childLayer) => {
      featureLayers.push(...getFeatureLayers(childLayer));
    });

    return featureLayers;
  }

  return [];
}

function getLayerGraphicCount(layer: Layer): number | null {
  const directCount = getSpatialEntityLayerFeatureCount(layer);

  if (directCount !== null) {
    return directCount;
  }

  if (layer instanceof GroupLayer) {
    let hasKnownCount = false;
    let total = 0;

    layer.layers.forEach((childLayer) => {
      const childCount = getLayerGraphicCount(childLayer);

      if (childCount !== null) {
        hasKnownCount = true;
        total += childCount;
      }
    });

    return hasKnownCount ? total : null;
  }

  return null;
}

function getLayerFirstGraphic(layer: Layer) {
  const directFirstGraphic = getSpatialEntityLayerFirstGraphic(layer);

  if (directFirstGraphic) {
    return directFirstGraphic;
  }

  if (layer instanceof GroupLayer) {
    let firstGraphic: object | null = null;

    layer.layers.some((childLayer) => {
      firstGraphic = getLayerFirstGraphic(childLayer);
      return firstGraphic !== null;
    });

    return firstGraphic;
  }

  return null;
}

function applyGraphicsLayerSymbolImmediate(
  layer: GraphicsLayer,
  symbol: GraphicSymbol,
  startIndex: number,
  endIndex: number,
) {
  for (let index = startIndex; index < endIndex; index += 1) {
    const graphic = layer.graphics.getItemAt(index);

    if (graphic && graphic.symbol !== symbol) {
      graphic.symbol = symbol;
    }
  }
}

function scheduleGraphicsLayerSymbolBatch(
  layer: GraphicsLayer,
  symbol: GraphicSymbol,
  version: number,
  startIndex: number,
) {
  if (graphicsLayerBatchVersions.get(layer) !== version) {
    return;
  }

  const endIndex = Math.min(
    startIndex + GRAPHICS_LAYER_SYMBOL_BATCH_SIZE,
    layer.graphics.length,
  );

  applyGraphicsLayerSymbolImmediate(layer, symbol, startIndex, endIndex);

  if (endIndex >= layer.graphics.length) {
    return;
  }

  window.requestAnimationFrame(() => {
    scheduleGraphicsLayerSymbolBatch(layer, symbol, version, endIndex);
  });
}

function applyGraphicsLayerSymbol(layer: GraphicsLayer, symbol: GraphicSymbol) {
  const version = (graphicsLayerBatchVersions.get(layer) ?? 0) + 1;
  graphicsLayerBatchVersions.set(layer, version);

  if (
    typeof window === "undefined" ||
    layer.graphics.length <= GRAPHICS_LAYER_SYMBOL_BATCH_SIZE
  ) {
    applyGraphicsLayerSymbolImmediate(layer, symbol, 0, layer.graphics.length);
    return;
  }

  // GraphicsLayer has no renderer, so this fallback yields between chunks
  // instead of blocking the main thread with thousands of symbol mutations.
  scheduleGraphicsLayerSymbolBatch(layer, symbol, version, 0);
}

function applyLayerSymbol(layer: Layer, symbol: GraphicSymbol) {
  const featureLayers = getFeatureLayers(layer);

  if (featureLayers.length > 0) {
    const renderer = createSimpleRenderer(symbol);

    featureLayers.forEach((featureLayer) => {
      featureLayer.renderer = renderer;
    });

    return;
  }

  if (layer instanceof GraphicsLayer) {
    applyGraphicsLayerSymbol(layer, symbol);
  }
}

function shouldEnablePointFeatureReduction(
  config: SpatialLayerConfig,
  mode: LayerDisplayMode,
  count: number | null,
) {
  return (
    config.geometryType === "Point" &&
    mode === "icon" &&
    config.performance?.useClustering === true &&
    count !== null &&
    count >= FEATURE_REDUCTION_MIN_FEATURES
  );
}

function applyPointFeatureReduction(
  layer: Layer,
  config: SpatialLayerConfig,
  mode: LayerDisplayMode,
) {
  const count = getLayerGraphicCount(layer);
  const featureReduction = shouldEnablePointFeatureReduction(config, mode, count)
    ? createSceneFeatureReduction()
    : null;

  getFeatureLayers(layer).forEach((featureLayer) => {
    const currentType = featureLayer.featureReduction?.type ?? null;
    const nextType = featureReduction?.type ?? null;

    if (currentType !== nextType) {
      featureLayer.featureReduction = featureReduction;
    }
  });
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

function isWithinFeatureLimit(count: number | null, limit?: number) {
  const normalizedLimit = Number(limit ?? 0);

  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
    return true;
  }

  return count === null || count <= normalizedLimit;
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
    applyPointFeatureReduction(layer, config, fallbackMode);
    cacheDisplayState(layer, fallbackMode);
    return;
  }

  const switchScale = Math.max(
    1,
    Math.round(switchScaleOverride ?? zoomRule.switchToModelScale),
  );
  const featureCount = getLayerGraphicCount(layer);
  const shouldUseModel =
    scale <= switchScale &&
    isWithinFeatureLimit(featureCount, config.performance?.maxModelFeatures);
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
  applyPointFeatureReduction(layer, config, nextMode);
  cacheDisplayState(layer, nextMode);
}

export function applyLineZoomRule(
  layer: Layer,
  config: SpatialLayerConfig,
  scale: number,
  switchScaleOverride?: number,
) {
  if (config.geometryType !== "LineString") return;

  const line = config.display.line;
  const switchScale = Math.max(
    1,
    Math.round(
      line?.pipeSwitchScale ??
        config.display.zoomRule?.switchToModelScale ??
        switchScaleOverride ??
        3000,
    ),
  );
  const shouldUsePipe =
    scale <= switchScale &&
    isWithinFeatureLimit(
      getLayerGraphicCount(layer),
      config.performance?.maxPipeFeatures,
    );
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
