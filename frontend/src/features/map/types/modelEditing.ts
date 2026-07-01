import type { MapPoint3D } from "./mapPoint";
import type {
  CreationCoordinate,
  IndependentCreationMode,
  IndependentEntityFeature,
  IndependentEntitySource,
} from "./independentEntity";

export type ModelTransformState = {
  pointId: string;
  objectId: number;
  name: string;
  modelUrl: string;
  longitude: number;
  latitude: number;
  elevation: number;
  heading: number;
  tilt: number;
  roll: number;
  scale: number;
};

export type MapEditingState = {
  pointsById: Record<string, MapPoint3D>;
  independentEntitiesById: Record<string, IndependentEntityFeature>;
  selectedEntityId: string | null;
  selectedEntitySource: IndependentEntitySource | null;
  creationMode: IndependentCreationMode;
  creationDraft: IndependentEntityFeature | null;
  creationVertices: CreationCoordinate[];
  isManagerPanelOpen: boolean;
  isDetailPanelOpen: boolean;
  isEditPanelOpen: boolean;
  selectedModel: ModelTransformState | null;
  transformDraft: ModelTransformState | null;
  isEditing: boolean;
};
