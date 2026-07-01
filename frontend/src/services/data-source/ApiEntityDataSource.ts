import type { GeoJSONFeatureCollection } from "../../modules/spatial-layers/types/geojson.types";
import { loadSpatialLayerConfigs } from "../../modules/spatial-layers/services/layerConfig.service";
import { fetchIndependentEntityFeatures } from "../api/entityApi";
import { bboxToString, parseBbox } from "../static-data/bbox";
import type { EntityDataSource, EntityQueryParams } from "./types";

export class ApiEntityDataSource implements EntityDataSource {
  getLayers() {
    return loadSpatialLayerConfigs();
  }

  getIndependentEntities(params?: EntityQueryParams) {
    return fetchIndependentEntityFeatures({
      bbox: bboxToString(parseBbox(params?.bbox ?? null)),
      scale: params?.scale,
    });
  }

  async getLayerEntities(): Promise<GeoJSONFeatureCollection> {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }
}
