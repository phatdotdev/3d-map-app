import Graphic from "@arcgis/core/Graphic";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import SceneView from "@arcgis/core/views/SceneView";
import Editor from "@arcgis/core/widgets/Editor";

import type { MapPoint3D } from "../types/mapPoint";
import type { ModelTransformState } from "../types/modelEditing";
import { closeViewPopup } from "../utils/closeViewPopup";
import {
  type IndependentEntityFeature,
} from "../types/independentEntity";
import {
  applyEditedGraphicToIndependentFeature,
  queryIndependentGeometryFeatureByEntityId,
} from "../../../utils/map-render/renderIndependentEntity";
import type Map from "@arcgis/core/Map";
import {
  applyTransformToModelFeatureLayer,
  buildModelTransformState,
  buildPointFromTransformState,
  queryModelFeatureByPointId,
  syncModelLayerEdits,
} from "../../../utils/map-render/renderPoint";
import { SelectionManager } from "./SelectionManager";

type EditorManagerOptions = {
  map: Map;
  view: SceneView;
  modelLayer: FeatureLayer;
  getPointById: (pointId: string) => MapPoint3D | undefined;
  getIndependentFeatureById?: (
    entityId: string,
  ) => IndependentEntityFeature | undefined;
  onEditingChange: (isEditing: boolean) => void;
  onTransformChange: (transform: ModelTransformState) => void;
  onConfirm: (payload: {
    point: MapPoint3D;
    transform: ModelTransformState;
  }) => Promise<void> | void;
  onIndependentGeometryConfirm?: (
    feature: IndependentEntityFeature,
  ) => Promise<void> | void;
  onSpatialFeatureConfirm?: (feature: Graphic) => Promise<void> | void;
  selectionManager: SelectionManager;
};

function numbersEqual(first: number, second: number) {
  return Math.abs(first - second) < 0.000001;
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function anglesEqual(first: number, second: number) {
  const diff = Math.abs(normalizeAngle(first) - normalizeAngle(second));
  return Math.min(diff, 360 - diff) < 0.000001;
}

function getRotateAngle(toolEventInfo: unknown) {
  if (!toolEventInfo || typeof toolEventInfo !== "object") {
    return null;
  }

  const angle = Number((toolEventInfo as { angle?: unknown }).angle);
  return Number.isFinite(angle) ? angle : null;
}

export class EditorManager {
  private readonly map: Map;
  private readonly view: SceneView;
  private readonly modelLayer: FeatureLayer;
  private readonly getPointById: (pointId: string) => MapPoint3D | undefined;
  private readonly getIndependentFeatureById?: (
    entityId: string,
  ) => IndependentEntityFeature | undefined;
  private readonly onEditingChange: (isEditing: boolean) => void;
  private readonly onTransformChange: (transform: ModelTransformState) => void;
  private readonly onConfirm: (payload: {
    point: MapPoint3D;
    transform: ModelTransformState;
  }) => Promise<void> | void;
  private readonly onIndependentGeometryConfirm?: (
    feature: IndependentEntityFeature,
  ) => Promise<void> | void;
  private readonly onSpatialFeatureConfirm?: (feature: Graphic) => Promise<void> | void;
  private readonly selectionManager: SelectionManager;
  private editor: Editor | null = null;
  private editorContainer: HTMLDivElement | null = null;
  private activePointId: string | null = null;
  private activeEntityId: string | null = null;
  private activeEntityGraphic: Graphic | null = null;
  private activeSpatialGraphic: Graphic | null = null;
  private snapshot: ModelTransformState | null = null;
  private latestModelTransform: ModelTransformState | null = null;
  private entitySnapshot: IndependentEntityFeature | null = null;
  private sketchUpdateHandle: { remove: () => void } | null = null;

  constructor(options: EditorManagerOptions) {
    this.map = options.map;
    this.view = options.view;
    this.modelLayer = options.modelLayer;
    this.getPointById = options.getPointById;
    this.getIndependentFeatureById = options.getIndependentFeatureById;
    this.onEditingChange = options.onEditingChange;
    this.onTransformChange = options.onTransformChange;
    this.onConfirm = options.onConfirm;
    this.onIndependentGeometryConfirm = options.onIndependentGeometryConfirm;
    this.onSpatialFeatureConfirm = options.onSpatialFeatureConfirm;
    this.selectionManager = options.selectionManager;
  }

  isEditing() {
    return (
      this.activePointId !== null ||
      this.activeEntityId !== null ||
      this.activeSpatialGraphic !== null
    );
  }

  async startEdit(feature: Graphic) {
    const pointId = String(feature.attributes?.pointId ?? "");
    const point = this.getPointById(pointId);

    if (!pointId || !point) return;

    this.ensureEditor();

    if (!this.editor) return;

    if (this.activePointId && this.activePointId !== pointId) {
      await this.cancel();
    }

    this.snapshot = buildModelTransformState(feature, point);
    this.latestModelTransform = this.snapshot;
    this.activePointId = pointId;
    this.onTransformChange(this.snapshot);
    this.onEditingChange(true);
    closeViewPopup(this.view);

    await this.editor.startUpdateWorkflowAtFeatureEdit(feature);
  }

  async startIndependentGeometryEdit(feature: Graphic) {
    const entityId = String(feature.attributes?.entityId ?? "");
    const entity = this.getIndependentFeatureById?.(entityId);

    if (!entityId || !entity) return;

    this.ensureEditor();

    if (!this.editor) return;

    if (this.isEditing()) {
      await this.cancel();
    }

    this.activeEntityId = entityId;
    this.activeEntityGraphic = feature;
    this.entitySnapshot = entity;
    this.onEditingChange(true);
    closeViewPopup(this.view);

    await this.editor.startUpdateWorkflowAtFeatureEdit(feature);
  }

  async startSpatialFeatureEdit(feature: Graphic) {
    this.ensureEditor();

    if (!this.editor) return;

    if (this.isEditing()) {
      await this.cancel();
    }

    this.activeSpatialGraphic = feature;
    this.onEditingChange(true);
    closeViewPopup(this.view);

    await this.editor.startUpdateWorkflowAtFeatureEdit(feature);
  }

  async confirm() {
    if (!this.editor?.activeWorkflow) return;

    if (this.activeEntityId) {
      await this.confirmIndependentGeometryEdit();
      return;
    }

    if (this.activeSpatialGraphic) {
      await this.confirmSpatialFeatureEdit();
      return;
    }

    if (!this.activePointId) return;

    await this.editor.activeWorkflow.commit();
    await syncModelLayerEdits(this.modelLayer);

    const updatedFeature = await queryModelFeatureByPointId(
      this.modelLayer,
      this.activePointId,
    );
    const point = this.getPointById(this.activePointId);

    if (!updatedFeature || !point) {
      this.resetEditingSession();
      return;
    }

    const committedTransform = buildModelTransformState(updatedFeature, point);
    const latestTransform = this.latestModelTransform;
    const snapshot = this.snapshot;
    const latestHasEditedRotation =
      latestTransform && snapshot
        ? !anglesEqual(latestTransform.heading, snapshot.heading) ||
          !numbersEqual(latestTransform.tilt, snapshot.tilt) ||
          !numbersEqual(latestTransform.roll, snapshot.roll)
        : false;
    const transform = this.latestModelTransform
      ? {
          ...committedTransform,
          longitude: this.latestModelTransform.longitude,
          latitude: this.latestModelTransform.latitude,
          elevation: this.latestModelTransform.elevation,
          heading: this.latestModelTransform.heading,
          tilt: this.latestModelTransform.tilt,
          roll: this.latestModelTransform.roll,
          scale: this.latestModelTransform.scale,
        }
      : committedTransform;
    const nextPoint = buildPointFromTransformState(transform, point);

    await this.selectionManager.refresh(updatedFeature);
    this.onTransformChange(transform);
    await this.onConfirm({
      point: nextPoint,
      transform,
    });

    this.resetEditingSession();
  }

  async cancel() {
    if (!this.editor || !this.isEditing()) return;

    await this.editor.cancelWorkflow();

    if (this.snapshot) {
      this.onTransformChange(this.snapshot);
    }

    this.resetEditingSession();
  }

  updateActiveModelTransform(transform: ModelTransformState) {
    if (!this.activePointId || this.activePointId !== transform.pointId) {
      return;
    }

    this.latestModelTransform = transform;
    applyTransformToModelFeatureLayer(this.modelLayer, transform);
    this.onTransformChange(transform);
  }

  dispose() {
    this.sketchUpdateHandle?.remove();
    this.sketchUpdateHandle = null;
    this.editor?.destroy();
    this.editor = null;
    this.editorContainer?.remove();
    this.editorContainer = null;
    this.snapshot = null;
    this.latestModelTransform = null;
    this.entitySnapshot = null;
    this.activePointId = null;
    this.activeEntityId = null;
    this.activeEntityGraphic = null;
    this.activeSpatialGraphic = null;
  }

  private ensureEditor() {
    if (this.editor) return;

    this.editorContainer = document.createElement("div");
    this.editorContainer.style.position = "absolute";
    this.editorContainer.style.width = "1px";
    this.editorContainer.style.height = "1px";
    this.editorContainer.style.opacity = "0";
    this.editorContainer.style.pointerEvents = "none";
    this.editorContainer.style.overflow = "hidden";

    const viewContainer = this.view.container;

    if (!viewContainer) {
      return;
    }

    viewContainer.appendChild(this.editorContainer);

    this.editor = new Editor({
      container: this.editorContainer,
      view: this.view,
    });

    this.sketchUpdateHandle = this.editor.on("sketch-update", (event) => {
      const graphic = event.detail.graphics[0];
      const pointId = String(graphic?.attributes?.pointId ?? "");
      const point = this.getPointById(pointId);

      if (!graphic || !point) return;
      if (this.activePointId && this.activePointId !== pointId) return;

      const toolEventInfo = event.detail.toolEventInfo;
      const toolEventType =
        typeof toolEventInfo?.type === "string" ? toolEventInfo.type : "";
      const isRotationUpdate = toolEventType.includes("rotate");
      const nextTransform = buildModelTransformState(graphic, point, {
        preferSymbolRotation: isRotationUpdate,
      });
      const previousTransform =
        this.latestModelTransform?.pointId === pointId
          ? this.latestModelTransform
          : null;
      const rotateAngle = isRotationUpdate
        ? getRotateAngle(toolEventInfo)
        : null;
      const snapshot =
        this.snapshot?.pointId === pointId ? this.snapshot : previousTransform;
      const heading =
        isRotationUpdate &&
        rotateAngle !== null &&
        snapshot &&
        anglesEqual(
          nextTransform.heading,
          previousTransform?.heading ?? snapshot.heading,
        )
          ? normalizeAngle(snapshot.heading + rotateAngle)
          : isRotationUpdate
            ? nextTransform.heading
            : (previousTransform?.heading ?? nextTransform.heading);
      const transform =
        previousTransform
          ? {
              ...nextTransform,
              heading,
              tilt: isRotationUpdate ? nextTransform.tilt : previousTransform.tilt,
              roll: isRotationUpdate ? nextTransform.roll : previousTransform.roll,
              scale: previousTransform.scale,
            }
          : {
              ...nextTransform,
              heading,
            };

      this.latestModelTransform = transform;
      this.onTransformChange(transform);
    });
  }

  private resetEditingSession() {
    this.activePointId = null;
    this.activeEntityId = null;
    this.activeEntityGraphic = null;
    this.activeSpatialGraphic = null;
    this.snapshot = null;
    this.latestModelTransform = null;
    this.entitySnapshot = null;
    this.onEditingChange(false);
  }

  private async confirmIndependentGeometryEdit() {
    if (!this.editor?.activeWorkflow || !this.activeEntityId) return;

    await this.editor.activeWorkflow.commit();

    const sourceFeature =
      this.getIndependentFeatureById?.(this.activeEntityId) ??
      this.entitySnapshot;
    const updatedGraphic =
      (await queryIndependentGeometryFeatureByEntityId(
        this.map,
        this.activeEntityId,
      )) ?? this.activeEntityGraphic;

    if (!sourceFeature || !updatedGraphic) {
      this.resetEditingSession();
      return;
    }

    const updatedFeature = applyEditedGraphicToIndependentFeature(
      sourceFeature,
      updatedGraphic,
    );

    await this.selectionManager.refresh(updatedGraphic);
    await this.onIndependentGeometryConfirm?.(updatedFeature);
    this.resetEditingSession();
  }

  private async confirmSpatialFeatureEdit() {
    if (!this.editor?.activeWorkflow || !this.activeSpatialGraphic) return;

    await this.editor.activeWorkflow.commit();

    const updatedGraphic =
      (await this.queryLatestGraphic(this.activeSpatialGraphic)) ??
      this.activeSpatialGraphic;

    await this.selectionManager.refresh(updatedGraphic);
    await this.onSpatialFeatureConfirm?.(updatedGraphic);
    this.resetEditingSession();
  }

  private async queryLatestGraphic(feature: Graphic) {
    const layer = feature.layer;

    if (!(layer instanceof FeatureLayer)) {
      return feature;
    }

    const objectId = feature.attributes?.OBJECTID;

    if (typeof objectId !== "number" && typeof objectId !== "string") {
      return feature;
    }

    const featureSet = await layer.queryFeatures({
      objectIds: [objectId],
      returnGeometry: true,
      outFields: ["*"],
    });

    return featureSet.features[0] ?? feature;
  }
}
