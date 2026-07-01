import type { IndependentEntityFeature } from "../../features/map/types/independentEntity";
import type { GeoJSONFeatureCollection } from "../../modules/spatial-layers/types/geojson.types";
import type { SpatialLayerConfig } from "../../modules/spatial-layers/types/spatial-layer.types";
import type { BboxArray } from "../static-data/bbox";

export type EntityQueryParams = {
  bbox?: string | BboxArray | null;
  scale?: number;
};

export interface EntityDataSource {
  getLayers(): Promise<SpatialLayerConfig[]>;
  getIndependentEntities(
    params?: EntityQueryParams,
  ): Promise<IndependentEntityFeature[]>;
  getLayerEntities(
    layerId: string,
    params?: EntityQueryParams,
  ): Promise<GeoJSONFeatureCollection>;
}

