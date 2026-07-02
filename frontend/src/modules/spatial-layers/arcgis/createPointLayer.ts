import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

import { createSpatialEntityGraphicsLayer } from "./entityFeatureLayerFactory";
import { createSpatialGraphicAttributes } from "./graphicAttributes";
import type {
  ParsedSpatialFeature,
  SpatialLayerConfig,
} from "../types/spatial-layer.types";
import { toPointCoordinate } from "../utils/geometryUtils";

export function createPointLayer(
  config: SpatialLayerConfig,
  features: ParsedSpatialFeature[],
): FeatureLayer {
  const graphics = features.flatMap((feature, index) => {
    const coordinate = toPointCoordinate(feature.coordinates, config);

    if (!coordinate) {
      console.warn(`Skipped point feature ${feature.id} in ${config.id}: invalid coordinates.`);
      return [];
    }

    const graphic = new Graphic({
        geometry: new Point({
          longitude: coordinate[0],
          latitude: coordinate[1],
          z: coordinate[2],
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
