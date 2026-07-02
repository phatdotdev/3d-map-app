import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

import { createSpatialEntityGraphicsLayer } from "./entityFeatureLayerFactory";
import { createSpatialGraphicAttributes } from "./graphicAttributes";
import type {
  ParsedSpatialFeature,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";
import { toPolygonRings } from "../utils/geometryUtils";

export function createPolygonLayer(
  config: SpatialLayerConfig,
  features: ParsedSpatialFeature[],
): FeatureLayer {
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

    return [graphic];
  });

  return createSpatialEntityGraphicsLayer(config, graphics);
}
