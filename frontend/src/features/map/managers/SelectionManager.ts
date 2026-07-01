import Graphic from "@arcgis/core/Graphic";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import SceneView from "@arcgis/core/views/SceneView";

import { EntitySelectionManager } from "../highlight/entitySelectionManager";

export class SelectionManager {
  private readonly view: SceneView;
  private readonly modelLayer: FeatureLayer;
  private readonly entitySelectionManager: EntitySelectionManager;
  private selectedFeature: Graphic | null = null;

  constructor(
    view: SceneView,
    modelLayer: FeatureLayer,
    entitySelectionManager: EntitySelectionManager,
  ) {
    this.view = view;
    this.modelLayer = modelLayer;
    this.entitySelectionManager = entitySelectionManager;
  }

  async select(feature: Graphic, shouldZoom = true) {
    this.selectedFeature = feature;
    await this.highlight(feature);

    if (shouldZoom) {
      await this.zoomTo(feature);
    }
  }

  getSelectedFeature() {
    return this.selectedFeature;
  }

  async refresh(feature: Graphic | null) {
    if (!feature) return;

    this.selectedFeature = feature;
    await this.highlight(feature);
  }

  clear() {
    this.entitySelectionManager.clearSelection();
    this.selectedFeature = null;
  }

  dispose() {
    this.clear();
  }

  private async highlight(feature: Graphic) {
    const objectId = feature.attributes?.OBJECTID;

    if (typeof objectId === "number" || typeof objectId === "string") {
      await this.entitySelectionManager.selectFeatureByObjectId(
        this.view,
        this.modelLayer,
        objectId,
      );
      return;
    }

    await this.entitySelectionManager.selectFeatureByGraphic(this.view, feature);
  }

  private async zoomTo(feature: Graphic) {
    const targetScale = Math.min(this.view.scale, 800);

    try {
      await this.view.goTo(
        {
          target: feature,
          scale: targetScale,
        },
        {
          animate: true,
          duration: 800,
        },
      );
    } catch {
      return;
    }
  }
}
