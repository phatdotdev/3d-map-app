import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { MapPoint3D } from "../types/mapPoint";
import type { MapEditingState, ModelTransformState } from "../types/modelEditing";
import {
  getIndependentEntityId,
  type CreationCoordinate,
  type IndependentCreationMode,
  type IndependentCreationType,
  type IndependentEntityFeature,
  type IndependentEntitySource,
} from "../types/independentEntity";

const initialState: MapEditingState = {
  pointsById: {},
  independentEntitiesById: {},
  selectedEntityId: null,
  selectedEntitySource: null,
  creationMode: "idle",
  creationDraft: null,
  creationVertices: [],
  isManagerPanelOpen: true,
  isDetailPanelOpen: false,
  isEditPanelOpen: false,
  selectedModel: null,
  transformDraft: null,
  isEditing: false,
};

function toPointsById(points: MapPoint3D[]) {
  return points.reduce<Record<string, MapPoint3D>>((accumulator, point) => {
    accumulator[point.id] = point;
    return accumulator;
  }, {});
}

function toIndependentEntitiesById(features: IndependentEntityFeature[]) {
  return features.reduce<Record<string, IndependentEntityFeature>>(
    (accumulator, feature) => {
      accumulator[getIndependentEntityId(feature)] = feature;
      return accumulator;
    },
    {},
  );
}

function toCreationMode(type: IndependentCreationType): IndependentCreationMode {
  return `creating-${type}` as IndependentCreationMode;
}

const mapEditingSlice = createSlice({
  name: "mapEditing",
  initialState,
  reducers: {
    initializePoints(state, action: PayloadAction<MapPoint3D[]>) {
      state.pointsById = toPointsById(action.payload);
    },
    initializeIndependentEntities(
      state,
      action: PayloadAction<IndependentEntityFeature[]>,
    ) {
      state.independentEntitiesById = toIndependentEntitiesById(action.payload);
    },
    upsertIndependentEntity(
      state,
      action: PayloadAction<IndependentEntityFeature>,
    ) {
      state.independentEntitiesById[getIndependentEntityId(action.payload)] =
        action.payload;
    },
    removeIndependentEntity(state, action: PayloadAction<string>) {
      delete state.independentEntitiesById[action.payload];

      if (
        state.selectedEntitySource === "independent" &&
        state.selectedEntityId === action.payload
      ) {
        state.selectedEntityId = null;
        state.selectedEntitySource = null;
        state.isDetailPanelOpen = false;
        state.isEditPanelOpen = false;
      }
    },
    startCreateIndependentEntity(
      state,
      action: PayloadAction<IndependentCreationType>,
    ) {
      state.creationMode = toCreationMode(action.payload);
      state.creationDraft = null;
      state.creationVertices = [];
      state.selectedEntityId = null;
      state.selectedEntitySource = null;
      state.selectedModel = null;
      state.transformDraft = null;
      state.isEditing = false;
      state.isDetailPanelOpen = false;
      state.isEditPanelOpen = false;
      state.isManagerPanelOpen = true;
    },
    addCreationVertex(state, action: PayloadAction<CreationCoordinate>) {
      state.creationVertices.push(action.payload);
    },
    setCreationVertices(state, action: PayloadAction<CreationCoordinate[]>) {
      state.creationVertices = action.payload;
    },
    finishCreationGeometry(
      state,
      action: PayloadAction<IndependentEntityFeature>,
    ) {
      state.creationDraft = action.payload;
      state.creationMode = "idle";
      state.creationVertices = [];
      state.isDetailPanelOpen = false;
      state.isEditPanelOpen = true;
      state.isManagerPanelOpen = true;
    },
    cancelCreation(state) {
      state.creationMode = "idle";
      state.creationDraft = null;
      state.creationVertices = [];
    },
    selectEntity(
      state,
      action: PayloadAction<{
        id: string;
        source: IndependentEntitySource;
      }>,
    ) {
      state.selectedEntityId = action.payload.id;
      state.selectedEntitySource = action.payload.source;
      state.isDetailPanelOpen = action.payload.source === "independent";
      state.isEditPanelOpen = false;
      state.creationDraft = null;
      state.creationMode = "idle";
      state.creationVertices = [];

      if (action.payload.source !== "independent") {
        state.selectedModel = null;
        state.transformDraft = null;
        state.isEditing = false;
      }
    },
    clearSelectedEntity(state) {
      state.selectedEntityId = null;
      state.selectedEntitySource = null;
      state.isDetailPanelOpen = false;
      state.isEditPanelOpen = false;
    },
    setManagerPanelOpen(state, action: PayloadAction<boolean>) {
      state.isManagerPanelOpen = action.payload;
    },
    setDetailPanelOpen(state, action: PayloadAction<boolean>) {
      state.isDetailPanelOpen = action.payload;
    },
    setEditPanelOpen(state, action: PayloadAction<boolean>) {
      state.isEditPanelOpen = action.payload;
    },
    selectModel(state, action: PayloadAction<ModelTransformState>) {
      state.selectedModel = action.payload;
      state.transformDraft = action.payload;
      state.isEditing = false;
      state.selectedEntityId = action.payload.pointId;
      state.selectedEntitySource = "independent";
      state.isDetailPanelOpen = false;
      state.isEditPanelOpen = false;
    },
    clearSelectedModel(state) {
      state.selectedModel = null;
      state.transformDraft = null;
      state.isEditing = false;
      if (state.selectedEntitySource === "independent") {
        state.selectedEntityId = null;
        state.selectedEntitySource = null;
      }
    },
    startEditingModel(state) {
      if (!state.selectedModel) return;

      state.isEditing = true;
      state.transformDraft = state.selectedModel;
    },
    updateTransformDraft(state, action: PayloadAction<ModelTransformState>) {
      state.transformDraft = action.payload;
    },
    finishEditingModel(
      state,
      action: PayloadAction<{
        point: MapPoint3D;
        transform: ModelTransformState;
      }>,
    ) {
      state.pointsById[action.payload.point.id] = action.payload.point;
      state.selectedModel = action.payload.transform;
      state.transformDraft = action.payload.transform;
      state.isEditing = false;
    },
    cancelEditingModel(state, action: PayloadAction<ModelTransformState>) {
      state.selectedModel = action.payload;
      state.transformDraft = action.payload;
      state.isEditing = false;
    },
    deletePoint(state, action: PayloadAction<string>) {
      delete state.pointsById[action.payload];

      if (state.selectedModel?.pointId === action.payload) {
        state.selectedModel = null;
        state.transformDraft = null;
        state.isEditing = false;
      }
    },
  },
});

export const {
  addCreationVertex,
  cancelCreation,
  clearSelectedEntity,
  clearSelectedModel,
  deletePoint,
  finishEditingModel,
  finishCreationGeometry,
  initializePoints,
  initializeIndependentEntities,
  removeIndependentEntity,
  selectModel,
  selectEntity,
  setCreationVertices,
  setDetailPanelOpen,
  setEditPanelOpen,
  setManagerPanelOpen,
  startEditingModel,
  startCreateIndependentEntity,
  upsertIndependentEntity,
  updateTransformDraft,
  cancelEditingModel,
} = mapEditingSlice.actions;

export const mapEditingReducer = mapEditingSlice.reducer;
