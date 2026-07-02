import Graphic from "@arcgis/core/Graphic";
import Polyline from "@arcgis/core/geometry/Polyline";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

import { createSpatialEntityGraphicsLayer } from "./entityFeatureLayerFactory";
import { createSpatialGraphicAttributes } from "./graphicAttributes";
import type {
  ParsedSpatialFeature,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";
import { toLinePath } from "../utils/geometryUtils";

export function createLineLayer(
  config: SpatialLayerConfig,
  features: ParsedSpatialFeature[],
): FeatureLayer {
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

    return [graphic];
  });

  return createSpatialEntityGraphicsLayer(config, graphics);
}
