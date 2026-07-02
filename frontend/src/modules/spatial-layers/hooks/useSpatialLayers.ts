import { useCallback, useEffect, useRef, useState } from "react";

import Graphic from "@arcgis/core/Graphic";
import type ArcGISMap from "@arcgis/core/Map";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type Layer from "@arcgis/core/layers/Layer";
import type SceneView from "@arcgis/core/views/SceneView";

import {
  createSpatialLayer,
  createSpatialLayerFromGeoJson,
} from "../arcgis/createSpatialLayer";
import {
  clearSpatialEntityLayerGraphics,
  getSpatialEntityLayerFeatureCount,
  syncSpatialEntityFeatureLayerGraphics,
} from "../arcgis/entityFeatureLayerFactory";
import { SPATIAL_PROPERTIES_JSON_FIELD } from "../arcgis/graphicAttributes";
import { isWebMode } from "../../../config/runtime";
import { staticAssetEntityDataSource } from "../../../services/data-source/StaticAssetEntityDataSource";
import {
  bboxToString,
  getViewBbox,
  type BboxArray,
} from "../../../services/static-data/bbox";
import {
  addSpatialLayerToMap,
  clearSpatialLayers,
  removeSpatialLayerFromMap,
  setSpatialLayerVisible,
} from "../arcgis/layerManager";
import { applySpatialZoomRules } from "../arcgis/zoomRenderer";
import {
  createStoredLayer,
  deleteStoredLayer,
  updateStoredLayer,
} from "../services/layerCrud.service";
import {
  getEnabledLayers,
  loadSpatialLayerConfigs,
} from "../services/layerConfig.service";
import type {
  SelectedSpatialFeature,
  SpatialGeometryType,
  SpatialLayerConfig,
  SpatialLayerState,
} from "../types/spatial-layer.types";

type UseSpatialLayersParams = {
  map: ArcGISMap | null;
  view: SceneView | null;
  pointModelSwitchScale: number;
  onSelectFeature?: (graphic: Graphic, feature: SelectedSpatialFeature) => void;
  onClearSelection?: () => void;
};

const LAYER_VISIBILITY_STORAGE_KEY = "arcgis-3d-web.spatial-layer-visibility";
const DEFAULT_STATIC_SYNC_DEBOUNCE_MS = 250;
const DEFAULT_VIEWPORT_PADDING_RATIO = 0.18;

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function updateLayerState(
  layers: SpatialLayerState[],
  layerId: string,
  patch: Partial<SpatialLayerState>,
) {
  let hasChanges = false;

  const nextLayers = layers.map((layer) => {
    if (layer.config.id !== layerId) {
      return layer;
    }

    const nextLayer = {
      ...layer,
      ...patch,
    };

    const changed = Object.keys(patch).some((key) => {
      const typedKey = key as keyof SpatialLayerState;
      return layer[typedKey] !== nextLayer[typedKey];
    });

    if (changed) {
      hasChanges = true;
      return nextLayer;
    }

    return layer;
  });

  return hasChanges ? nextLayers : layers;
}

function readPersistedLayerVisibility() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(LAYER_VISIBILITY_STORAGE_KEY);

    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, boolean>>(
      (result, [layerId, visible]) => {
        if (typeof visible === "boolean") {
          result[layerId] = visible;
        }

        return result;
      },
      {},
    );
  } catch {
    return {};
  }
}

function writePersistedLayerVisibility(visibilityByLayerId: Record<string, boolean>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LAYER_VISIBILITY_STORAGE_KEY,
    JSON.stringify(visibilityByLayerId),
  );
}

function toLayerStates(
  configs: SpatialLayerConfig[],
  currentLayers: SpatialLayerState[] = [],
) {
  const currentLayerById = new Map(
    currentLayers.map((layer) => [layer.config.id, layer]),
  );
  const persistedVisibility = readPersistedLayerVisibility();

  return getEnabledLayers(configs).map((config) => {
    const currentLayer = currentLayerById.get(config.id);
    const persistedVisible = persistedVisibility[config.id];

    return {
      config,
      visible: currentLayer?.visible ?? persistedVisible ?? config.visible,
      status: currentLayer?.status ?? "idle",
      error: currentLayer?.error,
      loadedFeatureCount: currentLayer?.loadedFeatureCount,
      totalFeatureCount: config.totalFeatures,
      loadMessage: currentLayer?.loadMessage,
    } satisfies SpatialLayerState;
  });
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function parseSpatialPropertiesJson(attributes: Record<string, unknown>) {
  const rawValue = attributes[SPATIAL_PROPERTIES_JSON_FIELD];

  if (typeof rawValue !== "string" || rawValue.length === 0) {
    return {};
  }

  try {
    return toRecord(JSON.parse(rawValue) as unknown);
  } catch {
    return {};
  }
}

function hydrateSpatialAttributes(attributes: Record<string, unknown>) {
  const hydratedAttributes = {
    ...parseSpatialPropertiesJson(attributes),
    ...attributes,
  };

  delete hydratedAttributes[SPATIAL_PROPERTIES_JSON_FIELD];
  return hydratedAttributes;
}

function toGeometryJson(graphic: Graphic) {
  const geometry = graphic.geometry;

  if (!geometry) {
    return undefined;
  }

  return geometry.toJSON() as Record<string, unknown>;
}

function toSelectedSpatialFeature(
  graphic: Graphic,
): SelectedSpatialFeature | null {
  const attributes = hydrateSpatialAttributes(toRecord(graphic.attributes));
  const sourceLayerId = String(attributes.sourceLayerId ?? "");
  const sourceLayerName = String(attributes.sourceLayerName ?? sourceLayerId);
  const geometryType = String(attributes.geometryType ?? "") as SpatialGeometryType;

  if (!sourceLayerId || !geometryType) {
    return null;
  }

  return {
    id: String(attributes.id ?? ""),
    sourceLayerId,
    sourceLayerName,
    geometryType,
    mapEditable: false,
    attributes,
    geometryJson: toGeometryJson(graphic),
  };
}

function bboxContains(outer: BboxArray, inner: BboxArray) {
  return (
    outer[0] <= inner[0] &&
    outer[1] <= inner[1] &&
    outer[2] >= inner[2] &&
    outer[3] >= inner[3]
  );
}

function clampViewportPaddingRatio(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return DEFAULT_VIEWPORT_PADDING_RATIO;
  }

  return Math.min(0.6, Math.max(0, numberValue));
}

function getStaticLayerSyncBounds(
  view: SceneView,
  config: SpatialLayerConfig,
) {
  const requestBbox = getViewBbox(view, {
    paddingRatio: clampViewportPaddingRatio(
      config.performance?.viewportPaddingRatio,
    ),
  });
  const visibleBbox = getViewBbox(view, {
    paddingRatio: 0,
    minPaddingDegrees: 0,
  });
  const bboxParam = bboxToString(requestBbox);

  if (!requestBbox || !visibleBbox || !bboxParam) {
    return null;
  }

  return {
    requestBbox,
    visibleBbox,
    bboxParam,
  };
}

function formatScale(value: number) {
  return `1:${Math.max(1, Math.round(value)).toLocaleString("vi-VN")}`;
}

function getScaleDeferMessage(config: SpatialLayerConfig, scale: number) {
  const minScale = Number(config.display.minScale ?? 0);
  const maxScale = Number(config.display.maxScale ?? 0);

  if (minScale > 0 && scale > minScale) {
    return `Phong to den ${formatScale(minScale)} de tai lop nay.`;
  }

  if (maxScale > 0 && scale < maxScale) {
    return `Thu nho den ${formatScale(maxScale)} de tai lop nay.`;
  }

  return undefined;
}

function isLayerActiveAtScale(config: SpatialLayerConfig, scale: number) {
  const minScale = Number(config.display.minScale ?? 0);
  const maxScale = Number(config.display.maxScale ?? 0);

  if (minScale > 0 && scale > minScale) {
    return false;
  }

  if (maxScale > 0 && scale < maxScale) {
    return false;
  }

  return true;
}

function getSpatialGraphicKey(graphic: Graphic) {
  const attributes = toRecord(graphic.attributes);
  const id = attributes.id;

  if (id === undefined || id === null || id === "") {
    return null;
  }

  return String(id);
}

function syncGraphicsLayerGraphics(layer: GraphicsLayer, nextLayer: GraphicsLayer) {
  const existingGraphics = layer.graphics.toArray();
  const existingByKey = new Map<string, Graphic>();

  existingGraphics.forEach((graphic) => {
    const key = getSpatialGraphicKey(graphic);

    if (key) {
      existingByKey.set(key, graphic);
    }
  });

  const nextGraphics = nextLayer.graphics.toArray();
  const nextKeys = new Set<string>();
  const graphicsToAdd: Graphic[] = [];

  nextGraphics.forEach((nextGraphic) => {
    const key = getSpatialGraphicKey(nextGraphic);

    if (!key) {
      graphicsToAdd.push(nextGraphic.clone());
      return;
    }

    nextKeys.add(key);

    const existingGraphic = existingByKey.get(key);

    if (!existingGraphic) {
      graphicsToAdd.push(nextGraphic.clone());
      return;
    }

    const clonedGraphic = nextGraphic.clone();
    existingGraphic.geometry = clonedGraphic.geometry;
    existingGraphic.attributes = clonedGraphic.attributes;
    existingGraphic.symbol = clonedGraphic.symbol;
    existingGraphic.popupTemplate = clonedGraphic.popupTemplate;
  });

  const graphicsToRemove = existingGraphics.filter((graphic) => {
    const key = getSpatialGraphicKey(graphic);
    return !key || !nextKeys.has(key);
  });

  if (graphicsToRemove.length > 0) {
    layer.graphics.removeMany(graphicsToRemove);
  }

  if (graphicsToAdd.length > 0) {
    layer.graphics.addMany(graphicsToAdd);
  }

  return {
    added: graphicsToAdd.length,
    removed: graphicsToRemove.length,
    total: layer.graphics.length,
  };
}

export function useSpatialLayers({
  map,
  view,
  pointModelSwitchScale,
  onSelectFeature,
  onClearSelection,
}: UseSpatialLayersParams) {
  const [layers, setLayers] = useState<SpatialLayerState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] =
    useState<SelectedSpatialFeature | null>(null);
  const layerCacheRef = useRef(new Map<string, Layer>());
  const pendingLayerIdsRef = useRef(new Set<string>());
  const staticSyncVersionRef = useRef(new Map<string, number>());
  const staticLoadedBboxRef = useRef(new Map<string, BboxArray>());
  const activeMapRef = useRef<ArcGISMap | null>(null);
  const layersRef = useRef<SpatialLayerState[]>([]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    let isActive = true;

    void loadSpatialLayerConfigs()
      .then((configs) => {
        if (!isActive) return;

        setLayers(
          toLayerStates(configs),
        );
      })
      .catch((loadError: unknown) => {
        if (!isActive) return;

        setError(toErrorMessage(loadError));
      })
      .finally(() => {
        if (!isActive) return;

        setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    activeMapRef.current = map;
  }, [map]);

  const syncStaticLayerChunks = useCallback(
    async (config: SpatialLayerConfig, layer: Layer) => {
      if (!isWebMode() || !view) {
        return;
      }

      const version = (staticSyncVersionRef.current.get(config.id) ?? 0) + 1;
      staticSyncVersionRef.current.set(config.id, version);

      if (!isLayerActiveAtScale(config, view.scale)) {
        await clearSpatialEntityLayerGraphics(layer);
        staticLoadedBboxRef.current.delete(config.id);
        setLayers((currentLayers) =>
          updateLayerState(currentLayers, config.id, {
            status: "deferred",
            error: undefined,
            loadedFeatureCount: 0,
            totalFeatureCount: config.totalFeatures,
            loadMessage: getScaleDeferMessage(config, view.scale),
          }),
        );
        return;
      }

      const syncBounds = getStaticLayerSyncBounds(view, config);

      if (!syncBounds) {
        return;
      }

      const loadedBbox = staticLoadedBboxRef.current.get(config.id);

      if (loadedBbox && bboxContains(loadedBbox, syncBounds.visibleBbox)) {
        applySpatialZoomRules(layer, config, view.scale, pointModelSwitchScale);
        setLayers((currentLayers) =>
          updateLayerState(currentLayers, config.id, {
            status: "ready",
            error: undefined,
            totalFeatureCount: config.totalFeatures,
            loadMessage: undefined,
          }),
        );
        return;
      }

      setLayers((currentLayers) =>
        updateLayerState(currentLayers, config.id, {
          status: "loading",
          error: undefined,
          totalFeatureCount: config.totalFeatures,
          loadMessage: undefined,
        }),
      );

      try {
        const collection = await staticAssetEntityDataSource.getLayerEntities(
          config.id,
          {
            bbox: syncBounds.bboxParam,
            scale: view.scale,
          },
        );

        if (staticSyncVersionRef.current.get(config.id) !== version) {
          return;
        }

        const nextLayer: Layer = createSpatialLayerFromGeoJson(config, collection);
        let loadedFeatureCount = collection.features.length;

        if (layer instanceof FeatureLayer && nextLayer instanceof FeatureLayer) {
          loadedFeatureCount = await syncSpatialEntityFeatureLayerGraphics(
            layer,
            nextLayer,
          );
          nextLayer.destroy();
        } else if (layer instanceof GraphicsLayer && nextLayer instanceof GraphicsLayer) {
          const syncResult = syncGraphicsLayerGraphics(layer, nextLayer);
          loadedFeatureCount = syncResult.total;
          nextLayer.destroy();
        }

        staticLoadedBboxRef.current.set(config.id, syncBounds.requestBbox);
        applySpatialZoomRules(layer, config, view.scale, pointModelSwitchScale);
        setLayers((currentLayers) =>
          updateLayerState(currentLayers, config.id, {
            status: "ready",
            error: undefined,
            loadedFeatureCount,
            totalFeatureCount: config.totalFeatures,
            loadMessage: undefined,
          }),
        );
      } catch (syncError: unknown) {
        const message = toErrorMessage(syncError);
        console.error(`Failed to sync static chunks for ${config.id}:`, syncError);
        setLayers((currentLayers) =>
          updateLayerState(currentLayers, config.id, {
            status: "error",
            error: message,
            totalFeatureCount: config.totalFeatures,
          }),
        );
      }
    },
    [pointModelSwitchScale, view],
  );

  const ensureLayerOnMap = useCallback(
    async (config: SpatialLayerConfig) => {
      if (!map || pendingLayerIdsRef.current.has(config.id)) {
        return;
      }

      const cachedLayer = layerCacheRef.current.get(config.id);

      if (cachedLayer) {
        setSpatialLayerVisible(map, config.id, true);
        if (view) {
          applySpatialZoomRules(
            cachedLayer,
            config,
            view.scale,
            pointModelSwitchScale,
          );
        }
        if (isWebMode()) {
          void syncStaticLayerChunks(config, cachedLayer);
        }
        return;
      }

      pendingLayerIdsRef.current.add(config.id);
        setLayers((currentLayers) =>
          updateLayerState(currentLayers, config.id, {
            status: "loading",
            error: undefined,
            totalFeatureCount: config.totalFeatures,
            loadMessage: undefined,
          }),
        );

      try {
        const layer = isWebMode()
          ? createSpatialLayerFromGeoJson(config, {
              type: "FeatureCollection",
              features: [],
            })
          : await createSpatialLayer(config);

        if (activeMapRef.current !== map) {
          layer.destroy();
          return;
        }

        layer.visible = true;
        addSpatialLayerToMap(map, layer);
        layerCacheRef.current.set(config.id, layer);
        if (view) {
          applySpatialZoomRules(layer, config, view.scale, pointModelSwitchScale);
        }
        setLayers((currentLayers) =>
          updateLayerState(currentLayers, config.id, {
            status: "ready",
            error: undefined,
            loadedFeatureCount:
              getSpatialEntityLayerFeatureCount(layer) ?? undefined,
            totalFeatureCount: config.totalFeatures,
            loadMessage: undefined,
          }),
        );

        if (isWebMode()) {
          void syncStaticLayerChunks(config, layer);
        }
      } catch (createError: unknown) {
        const message = toErrorMessage(createError);
        console.error(`Failed to create spatial layer ${config.id}:`, createError);
        setLayers((currentLayers) =>
          updateLayerState(currentLayers, config.id, {
            status: "error",
            error: message,
            totalFeatureCount: config.totalFeatures,
          }),
        );
      } finally {
        pendingLayerIdsRef.current.delete(config.id);
      }
    },
    [map, pointModelSwitchScale, syncStaticLayerChunks, view],
  );

  useEffect(() => {
    if (!map) return;

    layers.forEach((layer) => {
      if (layer.visible) {
        void ensureLayerOnMap(layer.config);
        return;
      }

      if (layerCacheRef.current.has(layer.config.id)) {
        setSpatialLayerVisible(map, layer.config.id, false);
      }
    });
  }, [ensureLayerOnMap, layers, map]);

  useEffect(() => {
    if (!map) return;

    const layerCache = layerCacheRef.current;
    const pendingLayerIds = pendingLayerIdsRef.current;

    return () => {
      clearSpatialLayers(map, Array.from(layerCache.keys()));
      layerCache.clear();
      pendingLayerIds.clear();
      staticSyncVersionRef.current.clear();
      staticLoadedBboxRef.current.clear();
      setSelectedFeature(null);
    };
  }, [map]);

  useEffect(() => {
    if (!view) return;

    const syncZoomRules = (scale: number) => {
      layerCacheRef.current.forEach((layer, layerId) => {
        const layerState = layersRef.current.find(
          (candidate) => candidate.config.id === layerId,
        );

        if (layerState) {
          applySpatialZoomRules(
            layer,
            layerState.config,
            scale,
            pointModelSwitchScale,
          );
        }
      });
    };

    syncZoomRules(view.scale);

    const scaleHandle = view.watch("scale", (scale) => {
      syncZoomRules(scale);
    });

    return () => {
      scaleHandle.remove();
    };
  }, [pointModelSwitchScale, view]);

  useEffect(() => {
    if (!view || !isWebMode()) return;

    let timeoutId: number | undefined;

    const scheduleSync = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        layersRef.current.forEach((layerState) => {
          if (!layerState.visible) return;

          const cachedLayer = layerCacheRef.current.get(layerState.config.id);

          if (cachedLayer) {
            void syncStaticLayerChunks(layerState.config, cachedLayer);
          } else {
            void ensureLayerOnMap(layerState.config);
          }
        });
      }, DEFAULT_STATIC_SYNC_DEBOUNCE_MS);
    };

    const stationaryHandle = view.watch("stationary", (stationary) => {
      if (stationary) {
        scheduleSync();
      }
    });

    scheduleSync();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      stationaryHandle.remove();
    };
  }, [ensureLayerOnMap, syncStaticLayerChunks, view]);

  useEffect(() => {
    if (!view) return;

    const clickHandle = view.on("click", async (event) => {
      const response = await view.hitTest(event);
      const spatialGraphic = response.results
        .map((result) => (result.type === "graphic" ? result.graphic : null))
        .find((graphic) => {
          if (!graphic) return false;

          const attributes = toRecord(graphic.attributes);
          const layerId = String(attributes.sourceLayerId ?? "");
          return Boolean(layerId && layerCacheRef.current.has(layerId));
        });

      if (!spatialGraphic) {
        setSelectedFeature(null);
        onClearSelection?.();
        return;
      }

      const selectedSpatialFeature = toSelectedSpatialFeature(spatialGraphic);
      setSelectedFeature(selectedSpatialFeature);

      if (selectedSpatialFeature) {
        onSelectFeature?.(spatialGraphic, selectedSpatialFeature);
      }
    });

    return () => {
      clickHandle.remove();
    };
  }, [onClearSelection, onSelectFeature, view]);

  const toggleLayer = useCallback((layerId: string, visible?: boolean) => {
    const targetLayer = layersRef.current.find(
      (layer) => layer.config.id === layerId,
    );

    if (!targetLayer) return;

    const nextVisible = visible ?? !targetLayer.visible;
    const nextConfig = {
      ...targetLayer.config,
      visible: nextVisible,
    };

    setLayers((currentLayers) =>
      currentLayers.map((layer) =>
        layer.config.id === layerId
          ? {
              ...layer,
              config: nextConfig,
              visible: nextVisible,
              error: undefined,
              loadedFeatureCount: nextVisible ? layer.loadedFeatureCount : 0,
              loadMessage: undefined,
            }
          : layer,
      ),
    );

    if (map) {
      const cachedLayer = layerCacheRef.current.get(layerId);

      if (cachedLayer) {
        cachedLayer.visible = nextVisible;
        if (nextVisible && isWebMode()) {
          void syncStaticLayerChunks(nextConfig, cachedLayer);
        }
      } else if (nextVisible) {
        void ensureLayerOnMap(nextConfig);
      }
    }

    const nextVisibilityByLayerId = layersRef.current.reduce<Record<string, boolean>>(
      (result, layer) => {
        result[layer.config.id] =
          layer.config.id === layerId ? nextVisible : layer.visible;
        return result;
      },
      {},
    );

    writePersistedLayerVisibility(nextVisibilityByLayerId);
  }, [ensureLayerOnMap, map]);

  const reloadLayer = useCallback(
    (layerId: string) => {
      const currentLayer = layersRef.current.find(
        (layer) => layer.config.id === layerId,
      );

      if (map) {
        removeSpatialLayerFromMap(map, layerId);
      }

      layerCacheRef.current.get(layerId)?.destroy();
      layerCacheRef.current.delete(layerId);
      pendingLayerIdsRef.current.delete(layerId);
      staticSyncVersionRef.current.delete(layerId);
      staticLoadedBboxRef.current.delete(layerId);

      setLayers((currentLayers) =>
        updateLayerState(currentLayers, layerId, {
          visible: currentLayer?.visible ?? true,
          status: "idle",
          error: undefined,
          loadedFeatureCount: undefined,
          loadMessage: undefined,
        }),
      );
    },
    [map],
  );

  const removeLayer = useCallback(
    (layerId: string) => {
      if (map) {
        removeSpatialLayerFromMap(map, layerId);
      }

      layerCacheRef.current.get(layerId)?.destroy();
      layerCacheRef.current.delete(layerId);
      pendingLayerIdsRef.current.delete(layerId);
      staticSyncVersionRef.current.delete(layerId);
      staticLoadedBboxRef.current.delete(layerId);

      setLayers((currentLayers) =>
        updateLayerState(currentLayers, layerId, {
          visible: false,
          status: "idle",
          error: undefined,
          loadedFeatureCount: undefined,
          loadMessage: undefined,
        }),
      );
    },
    [map],
  );

  const addLayer = useCallback(
    async (config: SpatialLayerConfig, file: File) => {
      const configs = await createStoredLayer(config, file);
      writePersistedLayerVisibility(
        configs.reduce<Record<string, boolean>>((result, layerConfig) => {
          result[layerConfig.id] = layerConfig.visible;
          return result;
        }, {}),
      );
      setLayers(toLayerStates(configs));
    },
    [],
  );

  const updateLayer = useCallback(
    async (layerId: string, config: SpatialLayerConfig, file?: File | null) => {
      if (map) {
        removeSpatialLayerFromMap(map, layerId);
      }

      layerCacheRef.current.get(layerId)?.destroy();
      layerCacheRef.current.delete(layerId);
      pendingLayerIdsRef.current.delete(layerId);
      staticSyncVersionRef.current.delete(layerId);
      staticLoadedBboxRef.current.delete(layerId);

      const configs = await updateStoredLayer(layerId, config, file);
      writePersistedLayerVisibility(
        configs.reduce<Record<string, boolean>>((result, layerConfig) => {
          result[layerConfig.id] = layerConfig.visible;
          return result;
        }, {}),
      );
      setLayers(toLayerStates(configs));

      if (selectedFeature?.sourceLayerId === layerId) {
        setSelectedFeature(null);
      }
    },
    [map, selectedFeature?.sourceLayerId],
  );

  const deleteLayer = useCallback(
    async (layerId: string) => {
      if (map) {
        removeSpatialLayerFromMap(map, layerId);
      }

      layerCacheRef.current.get(layerId)?.destroy();
      layerCacheRef.current.delete(layerId);
      pendingLayerIdsRef.current.delete(layerId);
      staticSyncVersionRef.current.delete(layerId);
      staticLoadedBboxRef.current.delete(layerId);

      const configs = await deleteStoredLayer(layerId);
      writePersistedLayerVisibility(
        configs.reduce<Record<string, boolean>>((result, layerConfig) => {
          result[layerConfig.id] = layerConfig.visible;
          return result;
        }, {}),
      );
      setLayers(toLayerStates(configs));

      if (selectedFeature?.sourceLayerId === layerId) {
        setSelectedFeature(null);
      }
    },
    [map, selectedFeature?.sourceLayerId],
  );

  const clearSelectedFeature = useCallback(() => {
    setSelectedFeature(null);
  }, []);

  return {
    layers,
    loading,
    error,
    selectedFeature,
    toggleLayer,
    reloadLayer,
    removeLayer,
    addLayer,
    updateLayer,
    deleteLayer,
    clearSelectedFeature,
  };
}
