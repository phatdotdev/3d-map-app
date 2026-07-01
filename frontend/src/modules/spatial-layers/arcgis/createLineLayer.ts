import Graphic from "@arcgis/core/Graphic";
import Polyline from "@arcgis/core/geometry/Polyline";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import {
  applySpatialGraphicSymbol,
  createSpatialEntityGraphicsLayer,
} from "./entityFeatureLayerFactory";
import { createSpatialGraphicAttributes } from "./graphicAttributes";
import { createLineSymbol } from "./symbolFactory";
import type {
  ParsedSpatialFeature,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";
import { toLinePath } from "../utils/geometryUtils";

export function createLineLayer(
  config: SpatialLayerConfig,
  features: ParsedSpatialFeature[],
): GraphicsLayer {
  const symbol = createLineSymbol(config);
  const graphics = features.flatMap((feature, index) => {
    const path = toLinePath(feature.coordinates, config);

    if (path.length < 2) {
      console.warn(`Skipped line feature ${feature.id} in ${config.id}: invalid path.`);
      return [];
    }

    const graphic = new Graphic({
        geometry: new Polyline({
          paths: [path],
          hasZ: true,
          spatialReference: {
            wkid: 4326,
          },
        }),
        attributes: {
          ...createSpatialGraphicAttributes(feature, config),
          OBJECTID: index + 1,
        },
        popupTemplate: null,
      });
    applySpatialGraphicSymbol(graphic, symbol);

    return [graphic];
  });

  return createSpatialEntityGraphicsLayer(config, graphics);
}
