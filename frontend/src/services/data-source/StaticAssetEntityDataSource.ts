import type { IndependentEntityFeature } from "../../features/map/types/independentEntity";
import type { GeoJSONFeatureCollection } from "../../modules/spatial-layers/types/geojson.types";
import type {
  SpatialLayerConfig,
  SpatialLayerConfigDocument,
} from "../../modules/spatial-layers/types/spatial-layer.types";
import {
  bboxIntersects,
  parseBbox,
  type BboxArray,
} from "../static-data/bbox";
import { filterGeoJsonByBbox } from "../static-data/geojsonChunkFilter";
import type { EntityDataSource, EntityQueryParams } from "./types";

type Catalog = {
  layers: string;
  independentEntities: {
    index: string;
  };
  modelRegistry: string;
};

type ChunkTile = {
  id: string;
  bbox: BboxArray;
  featureCount: number;
  url: string;
};

type ChunkIndex = {
  layerId?: string;
  name?: string;
  totalFeatures: number;
  chunkStrategy: "tile";
  tiles: ChunkTile[];
};

function emptyCollection(): GeoJSONFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "default",
  });

  if (!response.ok) {
    throw new Error(`Cannot load static asset ${url}.`);
  }

  return (await response.json()) as T;
}

export class StaticAssetEntityDataSource implements EntityDataSource {
  private catalogPromise: Promise<Catalog> | null = null;
  private layerDocumentPromise: Promise<SpatialLayerConfigDocument> | null = null;
  private indexByUrl = new Map<string, Promise<ChunkIndex>>();
  private chunkByUrl = new Map<string, Promise<GeoJSONFeatureCollection>>();
  private chunkAccessOrder: string[] = [];
  private readonly maxChunks = 50;

  async getCatalog() {
    if (!this.catalogPromise) {
      this.catalogPromise = fetchJson<Catalog>("/data/catalog.json");
    }

    return this.catalogPromise;
  }

  async getLayers(): Promise<SpatialLayerConfig[]> {
    if (!this.layerDocumentPromise) {
      this.layerDocumentPromise = this.getCatalog().then((catalog) =>
        fetchJson<SpatialLayerConfigDocument>(catalog.layers),
      );
    }

    const document = await this.layerDocumentPromise;
    return document.layers ?? [];
  }

  async getIndependentEntities(params?: EntityQueryParams) {
    const catalog = await this.getCatalog();
    const collection = await this.loadChunksForIndex(
      catalog.independentEntities.index,
      params,
      {
        loadAllWhenNoBbox: true,
        loadAllWhenEmpty: true,
      },
    );

    return collection.features as IndependentEntityFeature[];
  }

  async getLayerEntities(layerId: string, params?: EntityQueryParams) {
    const layers = await this.getLayers();
    const layer = layers.find((candidate) => candidate.id === layerId);
    const indexUrl = String(
      (layer as SpatialLayerConfig & { chunkIndex?: string })?.chunkIndex ??
        layer?.sourcePath ??
        "",
    );

    if (!indexUrl) {
      return emptyCollection();
    }

    return this.loadChunksForIndex(indexUrl, params);
  }

  private async loadIndex(indexUrl: string) {
    if (!this.indexByUrl.has(indexUrl)) {
      this.indexByUrl.set(indexUrl, fetchJson<ChunkIndex>(indexUrl));
    }

    return this.indexByUrl.get(indexUrl)!;
  }

  private async loadChunk(url: string) {
    if (!this.chunkByUrl.has(url)) {
      this.chunkByUrl.set(url, fetchJson<GeoJSONFeatureCollection>(url));
    }

    this.touchChunk(url);
    return this.chunkByUrl.get(url)!;
  }

  private touchChunk(url: string) {
    this.chunkAccessOrder = [
      ...this.chunkAccessOrder.filter((item) => item !== url),
      url,
    ];

    while (this.chunkAccessOrder.length > this.maxChunks) {
      const staleUrl = this.chunkAccessOrder.shift();

      if (staleUrl) {
        this.chunkByUrl.delete(staleUrl);
      }
    }
  }

  private async loadChunksForIndex(
    indexUrl: string,
    params?: EntityQueryParams,
    options: {
      loadAllWhenNoBbox?: boolean;
      loadAllWhenEmpty?: boolean;
    } = {},
  ) {
    const bbox = parseBbox(params?.bbox ?? null);
    const index = await this.loadIndex(indexUrl);

    if (!bbox && !options.loadAllWhenNoBbox) {
      return emptyCollection();
    }

    const matchingTiles = bbox
      ? index.tiles.filter((tile) => bboxIntersects(tile.bbox, bbox))
      : index.tiles;
    const tiles =
      matchingTiles.length > 0 || !options.loadAllWhenEmpty
        ? matchingTiles
        : index.tiles;
    const chunks = await Promise.all(tiles.map((tile) => this.loadChunk(tile.url)));
    const mergedCollection = {
      type: "FeatureCollection" as const,
      features: chunks.flatMap((chunk) => chunk.features),
    };

    if (options.loadAllWhenEmpty && matchingTiles.length === 0) {
      return mergedCollection;
    }

    const filteredCollection = await filterGeoJsonByBbox(mergedCollection, bbox);

    return options.loadAllWhenEmpty &&
      bbox &&
      filteredCollection.features.length === 0
      ? mergedCollection
      : filteredCollection;
  }
}

export const staticAssetEntityDataSource = new StaticAssetEntityDataSource();
