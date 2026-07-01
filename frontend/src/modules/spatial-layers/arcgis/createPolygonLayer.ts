import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import {
  applySpatialGraphicSymbol,
  createSpatialEntityGraphicsLayer,
} from "./entityFeatureLayerFactory";
import { createSpatialGraphicAttributes } from "./graphicAttributes";
import { createPolygonSymbol } from "./symbolFactory";
import type {
  ParsedSpatialFeature,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";
import { toPolygonRings } from "../utils/geometryUtils";

export function createPolygonLayer(
  config: SpatialLayerConfig,
  features: ParsedSpatialFeature[],
): GraphicsLayer {
  const symbol = createPolygonSymbol(config);
  const graphics = features.flatMap((feature, index) => {
    const rings = toPolygonRings(feature.coordinates, config);

    if (rings.length === 0) {
      console.warn(`Skipped polygon feature ${feature.id} in ${config.id}: invalid rings.`);
      return [];
    }

    const graphic = new Graphic({
        geometry: new Polygon({
          rings,
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
