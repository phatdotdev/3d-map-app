import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiSettings } from "react-icons/fi";

import "@arcgis/core/assets/esri/themes/light/main.css";

import Map from "@arcgis/core/Map";
import type Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import SceneView from "@arcgis/core/views/SceneView";

import { useAppDispatch, useAppSelector } from "../../app/hook";
import { isAppMode, isWebMode } from "../../config/runtime";
import { bboxToString, getViewBbox } from "../../services/static-data/bbox";
import { ModelManagerPanel } from "../model-manager/components/ModelManagerPanel";
import type {
  ModelRegistryEntry,
  ModelSplitResponse,
} from "../model-manager/types/modelRegistry";
import { IndependentEntityManagerPanel } from "./components/IndependentEntityManagerPanel";
import { MapDisplaySettingsPanel } from "./components/MapDisplaySettingsPanel";
import { MapEditingPanels } from "./components/MapEditingPanels";
import { SliceToggleButton } from "./components/SliceToggleButton";
import { IndependentCreationManager } from "./creation/independentCreationManager";
import {
  configureSelectionHighlight,
  EntitySelectionManager,
} from "./highlight/entitySelectionManager";
import { useSliceWidget } from "./hooks/useSliceWidget";
import { EditorManager } from "./managers/EditorManager";
import { MapInteractionManager } from "./managers/MapInteractionManager";
import { SelectionManager } from "./managers/SelectionManager";
import { SpatialLayerPanel } from "../../modules/spatial-layers/components/SpatialLayerPanel";
import { useSpatialLayers } from "../../modules/spatial-layers/hooks/useSpatialLayers";
import { updateStoredLayerFeatureGeometry } from "../../modules/spatial-layers/services/layerCrud.service";
import type {
  GeoJSONGeometry,
  GeoJSONPosition,
} from "../../modules/spatial-layers/types/geojson.types";
import type {
  SelectedSpatialFeature,
  SpatialGeometryType,
} from "../../modules/spatial-layers/types/spatial-layer.types";
import {
  createIndependentEntity as createIndependentEntityFeatureApi,
  deleteIndependentEntity,
  fetchIndependentEntityFeatures,
  loadSplitForIndependentFeature,
  updateIndependentEntity,
  updateIndependentEntityFeature,
} from "../../services/api/entityApi";
import {
  cancelCreation,
  clearSelectedEntity,
  clearSelectedModel,
  deletePoint,
  finishEditingModel,
  finishCreationGeometry,
  initializePoints,
  initializeIndependentEntities,
  removeIndependentEntity,
  selectEntity,
  selectModel,
  setCreationVertices,
  setDetailPanelOpen,
  setEditPanelOpen,
  setManagerPanelOpen,
  startEditingModel,
  startCreateIndependentEntity,
  updateTransformDraft,
  cancelEditingModel,
} from "./state/mapEditingSlice";
import {
  buildModelTransformState,
  ensurePointFeatureLayers,
  deletePointFeatures,
  getModelFeatureLayer,
  getPinFeatureLayer,
  queryFeatureByPointId,
  queryFeatureByPointIdOrSplitChild,
  syncPointFeatureLayersVisibility,
  updatePointFeatureLayersModelSwitchScale,
} from "../../utils/map-render/renderPoint";
import {
  getOrCreateIndependentGeometryFeatureLayers,
  queryIndependentGeometryFeatureByEntityId,
  renderIndependentEntities,
  syncIndependentLineStringsByScale,
} from "../../utils/map-render/renderIndependentEntity";
import {
  getIndependentEntityId,
  getIndependentEntityType,
  toMapPoint3D,
  toMapPoint3DList,
  type CreationCoordinate,
  type IndependentCreationType,
  type IndependentEntityFeature,
  type SplitRenderOptions,
} from "./types/independentEntity";
import {
  DEFAULT_MAP_DISPLAY_SETTINGS,
  MAP_DISPLAY_SETTINGS_STORAGE_KEY,
  clampGroundOpacity,
  normalizeMapDisplaySettings,
  normalizeModelSwitchScale,
  type MapBasemapOption,
  type MapDisplaySettings,
} from "./types/mapDisplaySettings";
import type { ModelTransformState } from "./types/modelEditing";
import type { MapPoint3D } from "./types/mapPoint";
import { closeViewPopup } from "./utils/closeViewPopup";

type ManagerBundle = {
  map: Map;
  view: SceneView;
  entitySelectionManager: EntitySelectionManager;
  creationManager: IndependentCreationManager;
  selectionManager: SelectionManager;
  editorManager: EditorManager;
  interactionManager: MapInteractionManager;
};

function collectFeatureCoordinates(
  value: unknown,
  result: CreationCoordinate[] = [],
) {
  if (!Array.isArray(value)) {
    return result;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    result.push([
      value[0],
      value[1],
      typeof value[2] === "number" ? value[2] : 0,
    ]);
    return result;
  }

  value.forEach((item) => collectFeatureCoordinates(item, result));
  return result;
}

function getFeatureCenter(feature: IndependentEntityFeature) {
  const coordinates = collectFeatureCoordinates(feature.geometry.coordinates);

  if (coordinates.length === 0) {
    return null;
  }

  const totals = coordinates.reduce(
    (accumulator, coordinate) => ({
      longitude: accumulator.longitude + coordinate[0],
      latitude: accumulator.latitude + coordinate[1],
      z: accumulator.z + coordinate[2],
    }),
    {
      longitude: 0,
      latitude: 0,
      z: 0,
    },
  );

  return new Point({
    longitude: totals.longitude / coordinates.length,
    latitude: totals.latitude / coordinates.length,
    z: totals.z / coordinates.length,
    spatialReference: {
      wkid: 4326,
    },
  });
}

function getSpatialFeatureEditKey(feature: SelectedSpatialFeature) {
  return `${feature.sourceLayerId}:${feature.id}`;
}

function toGeoJsonPosition(position: number[]): GeoJSONPosition {
  return [
    Number(position[0] ?? 0),
    Number(position[1] ?? 0),
    Number(position[2] ?? 0),
  ];
}

function getSpatialGeometryType(graphic: Graphic) {
  return String(graphic.attributes?.geometryType ?? "") as SpatialGeometryType;
}

function createGeoJsonGeometryFromSpatialGraphic(
  graphic: Graphic,
): GeoJSONGeometry {
  const geometryType = getSpatialGeometryType(graphic);

  if (geometryType === "Point") {
    const geometry = graphic.geometry as Point | null;

    if (!geometry) {
      throw new Error("Selected spatial feature has no point geometry.");
    }

    return {
      type: "Point",
      coordinates: [
        Number(geometry.longitude ?? 0),
        Number(geometry.latitude ?? 0),
        Number(geometry.z ?? 0),
      ],
    };
  }

  if (geometryType === "LineString") {
    const geometry = graphic.geometry as Polyline | null;
    const path = geometry?.paths?.[0] ?? [];

    return {
      type: "LineString",
      coordinates: path.map(toGeoJsonPosition),
    };
  }

  if (geometryType === "Polygon") {
    const geometry = graphic.geometry as Polygon | null;

    return {
      type: "Polygon",
      coordinates: (geometry?.rings ?? []).map((ring) =>
        ring.map(toGeoJsonPosition),
      ),
    };
  }

  if (geometryType === "MultiPolygon") {
    const geometry = graphic.geometry as Polygon | null;

    return {
      type: "MultiPolygon",
      coordinates: [
        (geometry?.rings ?? []).map((ring) => ring.map(toGeoJsonPosition)),
      ],
    };
  }

  throw new Error(`Unsupported spatial geometry type ${geometryType}.`);
}

function loadMapDisplaySettings() {
  if (typeof window === "undefined") {
    return DEFAULT_MAP_DISPLAY_SETTINGS;
  }

  try {
    const rawValue = window.localStorage.getItem(
      MAP_DISPLAY_SETTINGS_STORAGE_KEY,
    );

    if (!rawValue) {
      return DEFAULT_MAP_DISPLAY_SETTINGS;
    }

    return normalizeMapDisplaySettings(JSON.parse(rawValue) as unknown);
  } catch {
    return DEFAULT_MAP_DISPLAY_SETTINGS;
  }
}

function createBasemap(basemap: MapBasemapOption) {
  switch (basemap) {
    case "arcgis-streets":
      return "streets-vector";
    case "arcgis-satellite":
      return "satellite";
    case "arcgis-hybrid":
      return "hybrid";
    case "arcgis-topo":
      return "topo-vector";
    case "arcgis-dark-gray":
      return "dark-gray-vector";
    case "arcgis-light-gray":
      return "gray-vector";
    case "arcgis-navigation":
      return "streets-navigation-vector";
    case "osm":
    default:
      return "osm";
  }
}

function getSplitParentEntityId(pointId: string) {
  return pointId.split(":")[0] || pointId;
}

function applyModelTransformToIndependentFeature(
  feature: IndependentEntityFeature,
  transform: ModelTransformState,
): IndependentEntityFeature {
  if (feature.geometry.type !== "Point") {
    return feature;
  }

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: [
        transform.longitude,
        transform.latitude,
        transform.elevation,
      ],
    },
    properties: {
      ...feature.properties,
      modelUrl: transform.modelUrl,
      scale: transform.scale,
      rotation: {
        ...feature.properties.rotation,
        heading: ((transform.heading % 360) + 360) % 360,
        tilt: transform.tilt,
        roll: transform.roll,
      },
    },
  };
}

function createIndependentLayerRenderSignature(
  features: IndependentEntityFeature[],
  options: SplitRenderOptions = {},
) {
  return JSON.stringify({
    activeSplitEntityIds: Array.from(options.activeSplitEntityIds ?? []).sort(),
    features,
  });
}

function upsertIndependentFeature(
  features: IndependentEntityFeature[],
  replacement: IndependentEntityFeature | null | undefined,
) {
  if (!replacement) {
    return features;
  }

  const replacementId = getIndependentEntityId(replacement);
  let hasReplacement = false;
  const nextFeatures = features.map((feature) => {
    if (getIndependentEntityId(feature) !== replacementId) {
      return feature;
    }

    hasReplacement = true;
    return replacement;
  });

  return hasReplacement ? nextFeatures : [...nextFeatures, replacement];
}

function toPointsById(points: MapPoint3D[]) {
  return points.reduce<Record<string, MapPoint3D>>((accumulator, point) => {
    accumulator[point.id] = point;
    return accumulator;
  }, {});
}

function applyMapDisplaySettings(map: Map, settings: MapDisplaySettings) {
  map.ground.opacity = clampGroundOpacity(settings.groundOpacity);
  map.ground.navigationConstraint = {
    type: "none",
  };

  const nextBasemap = createBasemap(settings.basemap);
  map.basemap = nextBasemap;

  const activeBasemap = map.basemap;
  if (
    settings.basemap !== "osm" &&
    activeBasemap &&
    typeof activeBasemap.loadAll === "function"
  ) {
    void activeBasemap.loadAll().catch((error: unknown) => {
      console.warn(
        `ArcGIS basemap "${settings.basemap}" failed, fallback to OSM:`,
        error,
      );
      map.basemap = createBasemap("osm");
    });
  }
}

export default function ArcgisSceneMap() {
  const dispatch = useAppDispatch();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<ManagerBundle | null>(null);
  const selectedSpatialGraphicRef = useRef<Graphic | null>(null);
  const spatialFeatureSaveRef = useRef<(graphic: Graphic) => Promise<void>>(
    async () => undefined,
  );
  const [mapInstance, setMapInstance] = useState<Map | null>(null);
  const [viewInstance, setViewInstance] = useState<SceneView | null>(null);
  const [currentScale, setCurrentScale] = useState(
    DEFAULT_MAP_DISPLAY_SETTINGS.modelSwitchScale,
  );
  const [mapDisplaySettings, setMapDisplaySettings] =
    useState<MapDisplaySettings>(() => loadMapDisplaySettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [geometryEditingEntityId, setGeometryEditingEntityId] = useState<
    string | null
  >(null);
  const [spatialEditingFeatureId, setSpatialEditingFeatureId] = useState<
    string | null
  >(null);
  const [modelManagerOpen, setModelManagerOpen] = useState(false);
  const [activeSplitEntityIds, setActiveSplitEntityIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [splitRenderBusy, setSplitRenderBusy] = useState(false);
  const pointsById = useAppSelector((state) => state.mapEditing.pointsById);
  const selectedModel = useAppSelector(
    (state) => state.mapEditing.selectedModel,
  );
  const independentEntitiesById = useAppSelector(
    (state) => state.mapEditing.independentEntitiesById,
  );
  const selectedEntityId = useAppSelector(
    (state) => state.mapEditing.selectedEntityId,
  );
  const selectedEntitySource = useAppSelector(
    (state) => state.mapEditing.selectedEntitySource,
  );
  const creationMode = useAppSelector((state) => state.mapEditing.creationMode);
  const creationDraft = useAppSelector(
    (state) => state.mapEditing.creationDraft,
  );
  const isManagerPanelOpen = useAppSelector(
    (state) => state.mapEditing.isManagerPanelOpen,
  );
  const isDetailPanelOpen = useAppSelector(
    (state) => state.mapEditing.isDetailPanelOpen,
  );
  const isEditPanelOpen = useAppSelector(
    (state) => state.mapEditing.isEditPanelOpen,
  );
  const independentFeatures = useMemo(
    () => Object.values(independentEntitiesById),
    [independentEntitiesById],
  );
  const selectedModelParentId = selectedModel
    ? getSplitParentEntityId(selectedModel.pointId)
    : null;
  const selectedSplitFeature = useMemo(
    () =>
      selectedModelParentId
        ? (independentFeatures.find(
            (feature) =>
              getIndependentEntityId(feature) === selectedModelParentId,
          ) ?? null)
        : null,
    [independentFeatures, selectedModelParentId],
  );
  const selectedModelCanSplit =
    selectedSplitFeature?.properties.entityType === "model3d";
  const selectedModelSplitActive = selectedModelParentId
    ? activeSplitEntityIds.has(selectedModelParentId)
    : false;
  const zoomToSelectedModelBeforeSlice = useCallback(async () => {
    if (!viewInstance || !selectedModel) return;

    await viewInstance
      .goTo(
        {
          target: new Point({
            longitude: selectedModel.longitude,
            latitude: selectedModel.latitude,
            z: selectedModel.elevation,
            spatialReference: {
              wkid: 4326,
            },
          }),
          scale: Math.min(viewInstance.scale, 900),
        },
        {
          animate: true,
          duration: 650,
        },
      )
      .catch(() => undefined);
  }, [selectedModel, viewInstance]);
  const sliceWidget = useSliceWidget({
    view: viewInstance,
    onBeforeEnable: zoomToSelectedModelBeforeSlice,
  });
  const pointsRef = useRef(pointsById);
  const independentFeaturesRef = useRef(independentFeatures);
  const activeSplitEntityIdsRef = useRef(activeSplitEntityIds);
  const creationModeRef = useRef(creationMode);
  const selectedEntitySourceRef = useRef(selectedEntitySource);
  const mapDisplaySettingsRef = useRef(mapDisplaySettings);
  const independentLayerRenderSignatureRef = useRef<string | null>(null);
  const independentEntityLoadVersionRef = useRef(0);
  const renderIndependentFeatures = useCallback(
    async (
      features: IndependentEntityFeature[],
      map: Map,
      options: SplitRenderOptions = {},
    ) => {
      const signature = createIndependentLayerRenderSignature(
        features,
        options,
      );

      if (independentLayerRenderSignatureRef.current === signature) {
        return false;
      }

      independentLayerRenderSignatureRef.current = signature;

      try {
        await renderIndependentEntities(features, map, options);
        return true;
      } catch (error) {
        independentLayerRenderSignatureRef.current = null;
        throw error;
      }
    },
    [],
  );
  const syncIndependentFeaturesState = useCallback(
    (features: IndependentEntityFeature[]) => {
      const points = toMapPoint3DList(features, {
        activeSplitEntityIds: activeSplitEntityIdsRef.current,
      });

      independentFeaturesRef.current = features;
      pointsRef.current = toPointsById(points);

      dispatch(initializeIndependentEntities(features));
      dispatch(initializePoints(points));

      return points;
    },
    [dispatch],
  );
  const handleSpatialFeatureSelect = useCallback(
    (
      graphic: Graphic,
      feature: { id: string | number; sourceLayerId: string },
    ) => {
      selectedSpatialGraphicRef.current = graphic;
      managerRef.current?.selectionManager.clear();
      if (managerRef.current) {
        void managerRef.current.entitySelectionManager.selectFeatureByGraphic(
          managerRef.current.view,
          graphic,
        );
      }
      dispatch(
        selectEntity({
          id: `${feature.sourceLayerId}:${feature.id}`,
          source: "layer",
        }),
      );
    },
    [dispatch],
  );
  const handleSpatialFeatureClear = useCallback(() => {
    if (selectedEntitySourceRef.current !== "layer") return;

    selectedSpatialGraphicRef.current = null;
    setSpatialEditingFeatureId(null);
    managerRef.current?.entitySelectionManager.clearSelection();
    dispatch(clearSelectedEntity());
  }, [dispatch]);
  const spatialLayers = useSpatialLayers({
    map: mapInstance,
    view: viewInstance,
    pointModelSwitchScale: mapDisplaySettings.modelSwitchScale,
    onSelectFeature: handleSpatialFeatureSelect,
    onClearSelection: handleSpatialFeatureClear,
  });

  const setSplitEntityActive = useCallback(
    (entityId: string, active: boolean) => {
      const nextActiveIds = new Set(activeSplitEntityIdsRef.current);

      if (active) {
        nextActiveIds.add(entityId);
      } else {
        nextActiveIds.delete(entityId);
      }

      activeSplitEntityIdsRef.current = nextActiveIds;
      setActiveSplitEntityIds(nextActiveIds);
      return nextActiveIds;
    },
    [],
  );

  useEffect(() => {
    spatialFeatureSaveRef.current = async (graphic: Graphic) => {
      const layerId = String(graphic.attributes?.sourceLayerId ?? "");
      const featureId = String(graphic.attributes?.id ?? "");

      if (!layerId || !featureId) {
        throw new Error("Selected spatial feature is missing layer id or id.");
      }

      await updateStoredLayerFeatureGeometry(
        layerId,
        featureId,
        createGeoJsonGeometryFromSpatialGraphic(graphic),
      );

      spatialLayers.reloadLayer(layerId);
      spatialLayers.clearSelectedFeature();
      selectedSpatialGraphicRef.current = null;
      managerRef.current?.entitySelectionManager.clearSelection();
      dispatch(clearSelectedEntity());
      setSpatialEditingFeatureId(null);
    };
  }, [dispatch, spatialLayers]);

  useEffect(() => {
    pointsRef.current = pointsById;
  }, [pointsById]);

  useEffect(() => {
    independentFeaturesRef.current = independentFeatures;
  }, [independentFeatures]);

  useEffect(() => {
    activeSplitEntityIdsRef.current = activeSplitEntityIds;
  }, [activeSplitEntityIds]);

  useEffect(() => {
    creationModeRef.current = creationMode;
  }, [creationMode]);

  useEffect(() => {
    selectedEntitySourceRef.current = selectedEntitySource;
  }, [selectedEntitySource]);

  useEffect(() => {
    mapDisplaySettingsRef.current = mapDisplaySettings;
    let isCancelled = false;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        MAP_DISPLAY_SETTINGS_STORAGE_KEY,
        JSON.stringify(mapDisplaySettings),
      );
    }

    if (!mapInstance) return;

    applyMapDisplaySettings(mapInstance, mapDisplaySettings);

    void (async () => {
      await updatePointFeatureLayersModelSwitchScale(
        mapInstance,
        mapDisplaySettings.modelSwitchScale,
      );

      if (isCancelled || !viewInstance) return;

      syncPointFeatureLayersVisibility(mapInstance, viewInstance.scale);
      syncIndependentLineStringsByScale(
        independentFeaturesRef.current,
        mapInstance,
        viewInstance.scale,
        mapDisplaySettings.modelSwitchScale,
      );
      setCurrentScale(viewInstance.scale);
    })().catch((error: unknown) => {
      console.error("Failed to sync map display settings:", error);
    });

    return () => {
      isCancelled = true;
    };
  }, [mapDisplaySettings, mapInstance, viewInstance]);

  useEffect(() => {
    if (!mapRef.current) return;

    let isDisposed = false;

    const initialSettings = mapDisplaySettingsRef.current;
    const map = new Map({
      basemap: createBasemap(initialSettings.basemap),
      ground: "world-elevation",
    });
    applyMapDisplaySettings(map, initialSettings);

    const view = new SceneView({
      container: mapRef.current,
      map,
      camera: {
        position: {
          longitude: 105.7686,
          latitude: 10.0296,
          z: 500,
        },
        tilt: 45,
        heading: 320,
      },
      popupEnabled: false,
    });
    configureSelectionHighlight(view);

    const { modelLayer, pinLayer } = ensurePointFeatureLayers(map);
    const { lineLayer, polygonLayer } =
      getOrCreateIndependentGeometryFeatureLayers(map);
    const entitySelectionManager = new EntitySelectionManager(map);
    const creationManager = new IndependentCreationManager(map);

    const selectionManager = new SelectionManager(
      view,
      modelLayer,
      entitySelectionManager,
    );
    const editorManager = new EditorManager({
      map,
      view,
      modelLayer,
      getPointById: (pointId) => pointsRef.current[pointId],
      getIndependentFeatureById: (entityId) =>
        independentFeaturesRef.current.find(
          (feature) => getIndependentEntityId(feature) === entityId,
        ),
      onEditingChange: (isEditing) => {
        if (isEditing) {
          dispatch(startEditingModel());
          return;
        }

        setGeometryEditingEntityId(null);
      },
      onTransformChange: (transform) => {
        dispatch(updateTransformDraft(transform));
      },
      onConfirm: async ({ point, transform }) => {
        independentEntityLoadVersionRef.current += 1;
        const sourceFeature = independentFeaturesRef.current.find(
          (candidate) => getIndependentEntityId(candidate) === point.id,
        );
        let savedFeature: IndependentEntityFeature | undefined | null;
        let savedPoint = point;

        if (
          sourceFeature?.geometry.type === "Point" &&
          sourceFeature.properties.entityType === "model3d"
        ) {
          savedFeature = await updateIndependentEntityFeature(
            applyModelTransformToIndependentFeature(sourceFeature, transform),
          );
          savedPoint = savedFeature
            ? (toMapPoint3D(savedFeature) ?? point)
            : point;
        } else {
          savedPoint = await updateIndependentEntity(point);
        }

        const fetchedFeatures = await fetchIndependentEntityFeatures();
        const features = upsertIndependentFeature(
          fetchedFeatures,
          savedFeature,
        );

        const persistedFeature = features.find(
          (candidate) => getIndependentEntityId(candidate) === savedPoint.id,
        );
        const nextPoint = persistedFeature
          ? toMapPoint3D(persistedFeature)
          : savedFeature
            ? toMapPoint3D(savedFeature)
            : savedPoint;

        syncIndependentFeaturesState(features);
        await renderIndependentFeatures(features, map, {
          activeSplitEntityIds: activeSplitEntityIdsRef.current,
        });
        await updatePointFeatureLayersModelSwitchScale(
          map,
          mapDisplaySettingsRef.current.modelSwitchScale,
        );
        syncPointFeatureLayersVisibility(map, view.scale);
        syncIndependentLineStringsByScale(
          features,
          map,
          view.scale,
          mapDisplaySettingsRef.current.modelSwitchScale,
        );

        dispatch(
          finishEditingModel({
            point: nextPoint ?? savedPoint,
            transform,
          }),
        );
        console.log("Saved backend model point:", nextPoint ?? savedPoint);
      },
      onIndependentGeometryConfirm: async (feature) => {
        independentEntityLoadVersionRef.current += 1;
        const savedFeature = await updateIndependentEntityFeature(feature);
        const fetchedFeatures = await fetchIndependentEntityFeatures();
        const features = upsertIndependentFeature(
          fetchedFeatures,
          savedFeature,
        );

        syncIndependentFeaturesState(features);
        await renderIndependentFeatures(features, map, {
          activeSplitEntityIds: activeSplitEntityIdsRef.current,
        });
        await updatePointFeatureLayersModelSwitchScale(
          map,
          mapDisplaySettingsRef.current.modelSwitchScale,
        );
        syncPointFeatureLayersVisibility(map, view.scale);
        syncIndependentLineStringsByScale(
          features,
          map,
          view.scale,
          mapDisplaySettingsRef.current.modelSwitchScale,
        );

        const nextFeature =
          features.find(
            (candidate) =>
              getIndependentEntityId(candidate) ===
              getIndependentEntityId(savedFeature ?? feature),
          ) ??
          savedFeature ??
          feature;

        const selectedGraphic = await queryIndependentGeometryFeatureByEntityId(
          map,
          getIndependentEntityId(nextFeature),
        );

        if (selectedGraphic) {
          await entitySelectionManager.selectFeatureByGraphic(
            view,
            selectedGraphic,
          );
        }

        dispatch(
          selectEntity({
            id: getIndependentEntityId(nextFeature),
            source: "independent",
          }),
        );
      },
      onSpatialFeatureConfirm: async (feature) => {
        await spatialFeatureSaveRef.current(feature);
      },
      selectionManager,
    });

    const interactionManager = new MapInteractionManager({
      view,
      pinLayer,
      modelLayer,
      independentGeometryLayers: [lineLayer, polygonLayer],
      isEditing: () => editorManager.isEditing(),
      onCreateClick: (location) => {
        if (creationModeRef.current === "idle") {
          return false;
        }

        const result = creationManager.handleMapClick(location);

        if (!result) {
          return true;
        }

        if (result.status === "vertex-added") {
          dispatch(setCreationVertices(result.vertices));
          return true;
        }

        dispatch(finishCreationGeometry(result.feature));
        return true;
      },
      onModelClick: async (feature) => {
        const pointId = String(feature.attributes?.pointId ?? "");
        const point = pointsRef.current[pointId];

        if (!point) return;

        await selectionManager.select(feature);

        dispatch(selectModel(buildModelTransformState(feature, point)));
      },
      onPinClick: (feature) => {
        const pointId = String(feature.attributes?.pointId ?? "");
        const independentFeature = independentFeaturesRef.current.find(
          (candidate) => getIndependentEntityId(candidate) === pointId,
        );

        selectionManager.clear();
        closeViewPopup(view);

        if (independentFeature) {
          void entitySelectionManager.selectFeatureByGraphic(view, feature);
          dispatch(
            selectEntity({
              id: pointId,
              source: "independent",
            }),
          );
          return;
        }

        void entitySelectionManager.selectFeatureByGraphic(view, feature);
      },
      onIndependentGeometryClick: (feature) => {
        const entityId = String(feature.attributes?.entityId ?? "");
        const independentFeature = independentFeaturesRef.current.find(
          (candidate) => getIndependentEntityId(candidate) === entityId,
        );

        if (!independentFeature) return;

        selectionManager.clear();
        closeViewPopup(view);
        void entitySelectionManager.selectFeatureByGraphic(view, feature);
        dispatch(
          selectEntity({
            id: entityId,
            source: "independent",
          }),
        );
      },
      onMapClear: () => {
        selectedSpatialGraphicRef.current = null;
        setSpatialEditingFeatureId(null);
        selectionManager.clear();
        entitySelectionManager.clearSelection();
        closeViewPopup(view);
        dispatch(clearSelectedModel());
        dispatch(clearSelectedEntity());
      },
    });

    interactionManager.initialize();

    setMapInstance(map);
    setViewInstance(view);

    managerRef.current = {
      map,
      view,
      entitySelectionManager,
      creationManager,
      selectionManager,
      editorManager,
      interactionManager,
    };

    dispatch(initializePoints([]));
    dispatch(initializeIndependentEntities([]));
    void updatePointFeatureLayersModelSwitchScale(
      map,
      initialSettings.modelSwitchScale,
    ).catch((error: unknown) => {
      console.error("Failed to initialize point layer switch scale:", error);
    });
    syncPointFeatureLayersVisibility(map, view.scale);
    syncIndependentLineStringsByScale(
      independentFeaturesRef.current,
      map,
      view.scale,
      initialSettings.modelSwitchScale,
    );
    setCurrentScale(view.scale);

    const loadIndependentFeaturesForCurrentView = async () => {
      const loadVersion = ++independentEntityLoadVersionRef.current;
      const features = await fetchIndependentEntityFeatures(
        isWebMode()
          ? {
              bbox: bboxToString(getViewBbox(view)),
              scale: view.scale,
            }
          : undefined,
      );

      if (
        isDisposed ||
        loadVersion !== independentEntityLoadVersionRef.current
      ) {
        return;
      }

      syncIndependentFeaturesState(features);
      await renderIndependentFeatures(features, map, {
        activeSplitEntityIds: activeSplitEntityIdsRef.current,
      });
      await updatePointFeatureLayersModelSwitchScale(
        map,
        mapDisplaySettingsRef.current.modelSwitchScale,
      );
      if (
        isDisposed ||
        loadVersion !== independentEntityLoadVersionRef.current
      ) {
        return;
      }
      syncPointFeatureLayersVisibility(map, view.scale);
      syncIndependentLineStringsByScale(
        features,
        map,
        view.scale,
        mapDisplaySettingsRef.current.modelSwitchScale,
      );
    };

    void loadIndependentFeaturesForCurrentView().catch((error: unknown) => {
      console.error("Failed to load independent entities:", error);
    });

    void view.when(() => {
      if (isDisposed) return;

      syncPointFeatureLayersVisibility(map, view.scale);
      syncIndependentLineStringsByScale(
        independentFeaturesRef.current,
        map,
        view.scale,
        mapDisplaySettingsRef.current.modelSwitchScale,
      );
      setCurrentScale(view.scale);
    });

    let independentEntityLoadTimeout: number | undefined;
    let pointLayerVisibilitySyncTimeout: number | undefined;
    const syncPointLayerVisibilityForCurrentScale = () => {
      syncPointFeatureLayersVisibility(map, view.scale);
    };
    const schedulePointLayerVisibilitySync = () => {
      if (pointLayerVisibilitySyncTimeout !== undefined) {
        window.clearTimeout(pointLayerVisibilitySyncTimeout);
      }

      pointLayerVisibilitySyncTimeout = window.setTimeout(() => {
        pointLayerVisibilitySyncTimeout = undefined;
        syncPointLayerVisibilityForCurrentScale();
      }, 160);
    };
    const scheduleIndependentEntityLoad = () => {
      if (!isWebMode()) return;

      if (independentEntityLoadTimeout !== undefined) {
        window.clearTimeout(independentEntityLoadTimeout);
      }

      independentEntityLoadTimeout = window.setTimeout(() => {
        void loadIndependentFeaturesForCurrentView().catch((error: unknown) => {
          console.error("Failed to load independent entity chunks:", error);
        });
      }, 200);
    };

    const scaleHandle = view.watch("scale", (scale) => {
      setCurrentScale(scale);
      schedulePointLayerVisibilitySync();
      syncIndependentLineStringsByScale(
        independentFeaturesRef.current,
        map,
        scale,
        mapDisplaySettingsRef.current.modelSwitchScale,
      );
    });
    const stationaryHandle = view.watch("stationary", (stationary) => {
      if (stationary) {
        if (pointLayerVisibilitySyncTimeout !== undefined) {
          window.clearTimeout(pointLayerVisibilitySyncTimeout);
          pointLayerVisibilitySyncTimeout = undefined;
        }

        syncPointLayerVisibilityForCurrentScale();
        scheduleIndependentEntityLoad();
      }
    });

    return () => {
      isDisposed = true;
      managerRef.current?.interactionManager.dispose();
      managerRef.current?.editorManager.dispose();
      managerRef.current?.selectionManager.dispose();
      managerRef.current?.entitySelectionManager.dispose();
      managerRef.current?.creationManager.dispose();
      managerRef.current = null;
      independentLayerRenderSignatureRef.current = null;
      setMapInstance(null);
      setViewInstance(null);
      if (independentEntityLoadTimeout !== undefined) {
        window.clearTimeout(independentEntityLoadTimeout);
      }
      if (pointLayerVisibilitySyncTimeout !== undefined) {
        window.clearTimeout(pointLayerVisibilitySyncTimeout);
      }
      scaleHandle.remove();
      stationaryHandle.remove();
      view.destroy();
    };
  }, [dispatch, renderIndependentFeatures, syncIndependentFeaturesState]);

  useEffect(() => {
    if (!mapInstance) return;

    let isCancelled = false;

    dispatch(
      initializePoints(
        toMapPoint3DList(independentFeatures, {
          activeSplitEntityIds,
        }),
      ),
    );

    void (async () => {
      await renderIndependentFeatures(independentFeatures, mapInstance, {
        activeSplitEntityIds,
      });
      await updatePointFeatureLayersModelSwitchScale(
        mapInstance,
        mapDisplaySettings.modelSwitchScale,
      );

      if (isCancelled || !viewInstance) return;

      syncPointFeatureLayersVisibility(mapInstance, viewInstance.scale);
      syncIndependentLineStringsByScale(
        independentFeatures,
        mapInstance,
        viewInstance.scale,
        mapDisplaySettings.modelSwitchScale,
      );
    })().catch((error: unknown) => {
      console.error("Failed to render independent entities:", error);
    });

    return () => {
      isCancelled = true;
    };
  }, [
    activeSplitEntityIds,
    dispatch,
    independentFeatures,
    mapDisplaySettings.modelSwitchScale,
    mapInstance,
    renderIndependentFeatures,
    viewInstance,
  ]);

  useEffect(() => {
    const creationManager = managerRef.current?.creationManager;

    if (
      !creationManager ||
      creationMode === "idle" ||
      creationMode === "editing"
    ) {
      return;
    }

    creationManager.start(creationMode);
  }, [creationMode]);

  const reloadIndependentEntities = useCallback(
    async (savedFeature?: IndependentEntityFeature | null) => {
      const loadVersion = ++independentEntityLoadVersionRef.current;
      const fetchedFeatures = await fetchIndependentEntityFeatures(
        isWebMode() && managerRef.current
          ? {
              bbox: bboxToString(getViewBbox(managerRef.current.view)),
              scale: managerRef.current.view.scale,
            }
          : undefined,
      );
      const features = upsertIndependentFeature(fetchedFeatures, savedFeature);

      if (loadVersion !== independentEntityLoadVersionRef.current) {
        return independentFeaturesRef.current;
      }

      syncIndependentFeaturesState(features);

      if (managerRef.current) {
        await renderIndependentFeatures(features, managerRef.current.map, {
          activeSplitEntityIds: activeSplitEntityIdsRef.current,
        });
        await updatePointFeatureLayersModelSwitchScale(
          managerRef.current.map,
          mapDisplaySettingsRef.current.modelSwitchScale,
        );
        syncPointFeatureLayersVisibility(
          managerRef.current.map,
          managerRef.current.view.scale,
        );
        syncIndependentLineStringsByScale(
          features,
          managerRef.current.map,
          managerRef.current.view.scale,
          mapDisplaySettingsRef.current.modelSwitchScale,
        );
      }

      return features;
    },
    [renderIndependentFeatures, syncIndependentFeaturesState],
  );

  const selectIndependentFeatureOnMap = useCallback(
    async (feature: IndependentEntityFeature, shouldZoom = true) => {
      const managers = managerRef.current;
      const entityId = getIndependentEntityId(feature);

      if (!managers) return;

      managers.selectionManager.clear();

      let selectedGraphic: Graphic | null;

      if (feature.geometry.type === "Point") {
        const targetLayer =
          getIndependentEntityType(feature) === "model3d"
            ? getModelFeatureLayer(managers.map)
            : getPinFeatureLayer(managers.map);

        selectedGraphic = targetLayer
          ? getIndependentEntityType(feature) === "model3d"
            ? await queryFeatureByPointIdOrSplitChild(targetLayer, entityId)
            : await queryFeatureByPointId(targetLayer, entityId)
          : null;
      } else {
        selectedGraphic = await queryIndependentGeometryFeatureByEntityId(
          managers.map,
          entityId,
        );
      }

      if (selectedGraphic) {
        await managers.entitySelectionManager.selectFeatureByGraphic(
          managers.view,
          selectedGraphic,
        );
      } else {
        managers.entitySelectionManager.clearSelection();
      }

      if (!shouldZoom) return;

      const center = getFeatureCenter(feature);

      if (!center) return;

      await managers.view
        .goTo(
          {
            target: center,
            scale: Math.min(managers.view.scale, 1200),
          },
          {
            animate: true,
            duration: 700,
          },
        )
        .catch(() => undefined);
    },
    [],
  );

  const handleToggleSelectedModelSplit = useCallback(async () => {
    if (!selectedModel) return;

    const entityId = getSplitParentEntityId(selectedModel.pointId);
    const currentFeature = independentFeaturesRef.current.find(
      (feature) => getIndependentEntityId(feature) === entityId,
    );

    if (!currentFeature || currentFeature.properties.entityType !== "model3d") {
      return;
    }

    setSplitRenderBusy(true);

    try {
      if (activeSplitEntityIdsRef.current.has(entityId)) {
        const nextActiveIds = setSplitEntityActive(entityId, false);
        const features = independentFeaturesRef.current;

        dispatch(
          initializePoints(
            toMapPoint3DList(features, {
              activeSplitEntityIds: nextActiveIds,
            }),
          ),
        );

        if (managerRef.current) {
          await renderIndependentFeatures(features, managerRef.current.map, {
            activeSplitEntityIds: nextActiveIds,
          });
          await updatePointFeatureLayersModelSwitchScale(
            managerRef.current.map,
            mapDisplaySettingsRef.current.modelSwitchScale,
          );
          syncPointFeatureLayersVisibility(
            managerRef.current.map,
            managerRef.current.view.scale,
          );
        }

        if (selectedModel.pointId.includes(":")) {
          dispatch(clearSelectedModel());
          dispatch(
            selectEntity({
              id: entityId,
              source: "independent",
            }),
          );
        }

        return;
      }

      const hydratedFeature =
        await loadSplitForIndependentFeature(currentFeature);
      const nextFeature: IndependentEntityFeature = {
        ...hydratedFeature,
        properties: {
          ...hydratedFeature.properties,
          split: {
            ...hydratedFeature.properties.split,
            enabled: true,
            renderMode: "children",
          },
        },
      };
      const nextFeatures = independentFeaturesRef.current.map((feature) =>
        getIndependentEntityId(feature) === entityId ? nextFeature : feature,
      );
      const nextActiveIds = setSplitEntityActive(entityId, true);

      dispatch(initializeIndependentEntities(nextFeatures));
      dispatch(
        initializePoints(
          toMapPoint3DList(nextFeatures, {
            activeSplitEntityIds: nextActiveIds,
          }),
        ),
      );

      if (managerRef.current) {
        await renderIndependentFeatures(nextFeatures, managerRef.current.map, {
          activeSplitEntityIds: nextActiveIds,
        });
        await updatePointFeatureLayersModelSwitchScale(
          managerRef.current.map,
          mapDisplaySettingsRef.current.modelSwitchScale,
        );
        syncPointFeatureLayersVisibility(
          managerRef.current.map,
          managerRef.current.view.scale,
        );
      }

      await selectIndependentFeatureOnMap(nextFeature, false);
      dispatch(
        selectEntity({
          id: entityId,
          source: "independent",
        }),
      );
    } catch (error: unknown) {
      console.error("Failed to toggle split model rendering:", error);
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSplitRenderBusy(false);
    }
  }, [
    dispatch,
    renderIndependentFeatures,
    selectIndependentFeatureOnMap,
    selectedModel,
    setSplitEntityActive,
  ]);

  const handleStartCreate = useCallback(
    (type: IndependentCreationType) => {
      if (isWebMode()) {
        window.alert("Chuc nang nay chi kha dung trong APP mode.");
        return;
      }

      managerRef.current?.selectionManager.clear();
      managerRef.current?.entitySelectionManager.clearSelection();
      dispatch(startCreateIndependentEntity(type));
    },
    [dispatch],
  );

  const handleCancelCreation = useCallback(() => {
    managerRef.current?.creationManager.clearPreview();
    managerRef.current?.entitySelectionManager.clearSelection();
    dispatch(cancelCreation());
  }, [dispatch]);

  const handleSelectRegistryModel = useCallback(
    (model: ModelRegistryEntry) => {
      if (!isAppMode()) return;

      managerRef.current?.creationManager.setModelTemplate({
        modelId: model.id,
        modelUrl: model.url,
        name: model.name,
      });
      managerRef.current?.selectionManager.clear();
      managerRef.current?.entitySelectionManager.clearSelection();
      dispatch(setManagerPanelOpen(true));
      dispatch(startCreateIndependentEntity("model3d"));
    },
    [dispatch],
  );

  const handleSelectIndependentEntity = useCallback(
    (feature: IndependentEntityFeature) => {
      const entityId = getIndependentEntityId(feature);

      void selectIndependentFeatureOnMap(feature);

      dispatch(
        selectEntity({
          id: entityId,
          source: "independent",
        }),
      );
    },
    [dispatch, selectIndependentFeatureOnMap],
  );

  const handleStartGeometryEdit = useCallback(
    async (feature: IndependentEntityFeature) => {
      const managers = managerRef.current;
      const entityId = getIndependentEntityId(feature);

      if (!managers || feature.geometry.type === "Point") return;

      const graphic = await queryIndependentGeometryFeatureByEntityId(
        managers.map,
        entityId,
      );

      if (!graphic) return;

      managers.selectionManager.clear();
      await managers.entitySelectionManager.selectFeatureByGraphic(
        managers.view,
        graphic,
      );
      dispatch(
        selectEntity({
          id: entityId,
          source: "independent",
        }),
      );
      setGeometryEditingEntityId(entityId);
      await managers.editorManager.startIndependentGeometryEdit(graphic);
    },
    [dispatch],
  );

  const handleConfirmGeometryEdit = useCallback(async () => {
    try {
      await managerRef.current?.editorManager.confirm();
    } catch (error) {
      console.error("Failed to confirm independent geometry edit:", error);
    }
  }, []);

  const handleCancelGeometryEdit = useCallback(async () => {
    try {
      await managerRef.current?.editorManager.cancel();
    } catch (error) {
      console.error("Failed to cancel independent geometry edit:", error);
    } finally {
      setGeometryEditingEntityId(null);
    }
  }, []);

  const handleStartSpatialFeatureEdit = useCallback(
    async (feature: SelectedSpatialFeature) => {
      const managers = managerRef.current;
      const graphic = selectedSpatialGraphicRef.current;

      if (!managers || !graphic) return;

      managers.selectionManager.clear();
      await managers.entitySelectionManager.selectFeatureByGraphic(
        managers.view,
        graphic,
      );
      setSpatialEditingFeatureId(getSpatialFeatureEditKey(feature));
      await managers.editorManager.startSpatialFeatureEdit(graphic);
    },
    [],
  );

  const handleConfirmSpatialFeatureEdit = useCallback(async () => {
    try {
      await managerRef.current?.editorManager.confirm();
    } catch (error) {
      console.error("Failed to confirm spatial feature edit:", error);
    }
  }, []);

  const handleCancelSpatialFeatureEdit = useCallback(async () => {
    try {
      await managerRef.current?.editorManager.cancel();
    } catch (error) {
      console.error("Failed to cancel spatial feature edit:", error);
    } finally {
      setSpatialEditingFeatureId(null);
    }
  }, []);

  const handleSaveDraft = useCallback(
    async (feature: IndependentEntityFeature) => {
      independentEntityLoadVersionRef.current += 1;
      const savedFeature = await createIndependentEntityFeatureApi(feature);

      if (savedFeature) {
        managerRef.current?.creationManager.clearPreview();
        dispatch(cancelCreation());
        const features = await reloadIndependentEntities(savedFeature);
        const nextFeature =
          features.find(
            (candidate) =>
              getIndependentEntityId(candidate) ===
              getIndependentEntityId(savedFeature),
          ) ?? savedFeature;

        await selectIndependentFeatureOnMap(nextFeature, false);
        dispatch(
          selectEntity({
            id: getIndependentEntityId(nextFeature),
            source: "independent",
          }),
        );
      }
    },
    [dispatch, reloadIndependentEntities, selectIndependentFeatureOnMap],
  );

  const handleUpdateEntity = useCallback(
    async (feature: IndependentEntityFeature) => {
      independentEntityLoadVersionRef.current += 1;
      const savedFeature = await updateIndependentEntityFeature(feature);

      if (savedFeature) {
        const features = await reloadIndependentEntities(savedFeature);
        const nextFeature =
          features.find(
            (candidate) =>
              getIndependentEntityId(candidate) ===
              getIndependentEntityId(savedFeature),
          ) ?? savedFeature;

        await selectIndependentFeatureOnMap(nextFeature, false);
        dispatch(
          selectEntity({
            id: getIndependentEntityId(nextFeature),
            source: "independent",
          }),
        );
      }
    },
    [dispatch, reloadIndependentEntities, selectIndependentFeatureOnMap],
  );

  const handleModelSplit = useCallback(
    async (model: ModelRegistryEntry, result: ModelSplitResponse) => {
      if (!isAppMode() || result.parts.length === 0) return;

      const selectedFeature = independentFeaturesRef.current.find((feature) => {
        return (
          feature.properties.modelId === model.id ||
          feature.properties.modelUrl === model.url
        );
      });

      if (
        !selectedFeature ||
        selectedFeature.properties.entityType !== "model3d"
      ) {
        return;
      }

      setSplitEntityActive(getIndependentEntityId(selectedFeature), true);

      await handleUpdateEntity({
        ...selectedFeature,
        properties: {
          ...selectedFeature.properties,
          modelId: model.id,
          modelUrl: model.url,
          split: {
            enabled: true,
            renderMode: "children",
            manifestUrl: result.manifestUrl ?? undefined,
            parentBounds: result.parent?.bounds,
            children: result.parts.map((part) => ({
              id: part.id,
              name: part.name,
              modelUrl: part.url,
              visible: part.visible !== false,
              transformMode: "inherit-parent",
              metadata: part.metadata,
            })),
          },
        },
      });
    },
    [handleUpdateEntity, setSplitEntityActive],
  );

  const handleDeleteEntity = useCallback(
    async (feature: IndependentEntityFeature) => {
      const entityId = getIndependentEntityId(feature);

      await deleteIndependentEntity(entityId);
      managerRef.current?.entitySelectionManager.clearSelection();
      dispatch(removeIndependentEntity(entityId));
      dispatch(deletePoint(entityId));
      dispatch(clearSelectedEntity());
      await reloadIndependentEntities();
    },
    [dispatch, reloadIndependentEntities],
  );

  const handleClose = () => {
    managerRef.current?.selectionManager.clear();
    managerRef.current?.entitySelectionManager.clearSelection();
    if (managerRef.current) {
      closeViewPopup(managerRef.current.view);
    }
    dispatch(clearSelectedModel());
    dispatch(clearSelectedEntity());
  };

  const handleEdit = async () => {
    const selectedFeature =
      managerRef.current?.selectionManager.getSelectedFeature();

    if (!selectedFeature) return;

    await managerRef.current?.editorManager.startEdit(selectedFeature);
  };

  const handleDelete = async () => {
    if (isWebMode()) {
      window.alert("Chuc nang nay chi kha dung trong APP mode.");
      return;
    }

    const selectedPointId = selectedModel?.pointId;
    const managers = managerRef.current;
    const point = selectedPointId
      ? pointsRef.current[selectedPointId]
      : undefined;

    if (!selectedPointId || !managers || !point) return;

    managers.selectionManager.clear();
    closeViewPopup(managers.view);

    try {
      await deleteIndependentEntity(selectedPointId);
      await deletePointFeatures(managers.map, selectedPointId);
      dispatch(removeIndependentEntity(selectedPointId));
      dispatch(deletePoint(selectedPointId));
      dispatch(clearSelectedEntity());
      console.log("Deleted backend model point:", point);
    } catch (error) {
      console.error("Failed to delete backend point:", error);
    }
  };

  const handleConfirm = async () => {
    try {
      await managerRef.current?.editorManager.confirm();
    } catch (error) {
      console.error("Failed to confirm model edit:", error);
    }
  };

  const handleTransformChange = useCallback(
    (transform: ModelTransformState) => {
      dispatch(updateTransformDraft(transform));
      managerRef.current?.editorManager.updateActiveModelTransform(transform);
    },
    [dispatch],
  );

  const handleCancel = async () => {
    if (!selectedModel) return;

    await managerRef.current?.editorManager.cancel();
    dispatch(cancelEditingModel(selectedModel));
  };

  return (
    <div className="relative h-screen w-screen">
      <div ref={mapRef} className="h-full w-full" />
      <SliceToggleButton
        active={sliceWidget.active}
        onToggle={() => void sliceWidget.toggle()}
      />
      <ModelManagerPanel
        open={modelManagerOpen}
        onOpenChange={setModelManagerOpen}
        onSelectModel={handleSelectRegistryModel}
        onModelSplit={handleModelSplit}
      />
      <SpatialLayerPanel
        layers={spatialLayers.layers}
        loading={spatialLayers.loading}
        error={spatialLayers.error}
        selectedFeature={spatialLayers.selectedFeature}
        editingFeatureId={spatialEditingFeatureId}
        onToggleLayer={spatialLayers.toggleLayer}
        onReloadLayer={spatialLayers.reloadLayer}
        onAddLayer={spatialLayers.addLayer}
        onUpdateLayer={spatialLayers.updateLayer}
        onDeleteLayer={spatialLayers.deleteLayer}
        onStartFeatureEdit={handleStartSpatialFeatureEdit}
        onConfirmFeatureEdit={handleConfirmSpatialFeatureEdit}
        onCancelFeatureEdit={handleCancelSpatialFeatureEdit}
        onCloseSelectedFeature={() => {
          spatialLayers.clearSelectedFeature();
          selectedSpatialGraphicRef.current = null;
          setSpatialEditingFeatureId(null);
          managerRef.current?.entitySelectionManager.clearSelection();
          dispatch(clearSelectedEntity());
        }}
        readOnly={isWebMode()}
      />
      <IndependentEntityManagerPanel
        open={isManagerPanelOpen}
        features={independentFeatures}
        selectedEntityId={
          selectedEntitySource === "independent" ? selectedEntityId : null
        }
        creationMode={creationMode}
        creationDraft={creationDraft}
        isDetailOpen={isDetailPanelOpen}
        isEditOpen={isEditPanelOpen}
        geometryEditingEntityId={geometryEditingEntityId}
        onOpenChange={(open) => {
          if (!open) {
            managerRef.current?.entitySelectionManager.clearSelection();
            dispatch(clearSelectedEntity());
          }

          dispatch(setManagerPanelOpen(open));
        }}
        onStartCreate={handleStartCreate}
        onCancelCreation={handleCancelCreation}
        onSelectEntity={handleSelectIndependentEntity}
        onOpenEdit={() => {
          dispatch(setDetailPanelOpen(false));
          dispatch(setEditPanelOpen(true));
        }}
        onStartGeometryEdit={handleStartGeometryEdit}
        onConfirmGeometryEdit={handleConfirmGeometryEdit}
        onCancelGeometryEdit={handleCancelGeometryEdit}
        onCloseDetail={() => {
          managerRef.current?.entitySelectionManager.clearSelection();
          dispatch(clearSelectedEntity());
        }}
        onCloseEdit={() => dispatch(setEditPanelOpen(false))}
        onSaveDraft={handleSaveDraft}
        onUpdateEntity={handleUpdateEntity}
        onDeleteEntity={handleDeleteEntity}
        readOnly={isWebMode()}
      />
      {settingsOpen ? (
        <MapDisplaySettingsPanel
          currentScale={currentScale}
          settings={mapDisplaySettings}
          onClose={() => setSettingsOpen(false)}
          onChange={(nextSettings) =>
            setMapDisplaySettings({
              basemap: nextSettings.basemap,
              groundOpacity: clampGroundOpacity(nextSettings.groundOpacity),
              modelSwitchScale: normalizeModelSwitchScale(
                nextSettings.modelSwitchScale,
              ),
            })
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="absolute right-4 top-[4.25rem] z-20 inline-flex h-11 w-52 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/95 px-3.5 text-sm font-bold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-arcgis-blue hover:bg-white hover:text-arcgis-blue hover:shadow-xl active:translate-y-0"
          aria-label="Cài đặt bản đồ"
          title="Cài đặt bản đồ"
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-arcgis-blue text-white shadow-sm">
            <FiSettings className="text-base" aria-hidden="true" />
          </span>
          <span className="truncate">Cài đặt bản đồ</span>
        </button>
      )}
      <MapEditingPanels
        onClose={handleClose}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTransformChange={handleTransformChange}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onToggleSplit={handleToggleSelectedModelSplit}
        canToggleSplit={selectedModelCanSplit}
        splitActive={selectedModelSplitActive}
        splitBusy={splitRenderBusy}
        readOnly={isWebMode() || Boolean(selectedModel?.pointId.includes(":"))}
      />
    </div>
  );
}
