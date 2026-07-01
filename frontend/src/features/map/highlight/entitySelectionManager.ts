import Graphic from "@arcgis/core/Graphic";
import Map from "@arcgis/core/Map";
import Layer from "@arcgis/core/layers/Layer";
import SceneView from "@arcgis/core/views/SceneView";
import HighlightOptions from "@arcgis/core/views/support/HighlightOptions";

import { EntityHighlightManager } from "./entityHighlightManager";

const SELECTED_HIGHLIGHT_NAME = "selected";

type HighlightHandle = {
  remove: () => void;
};

type HighlightTarget = Graphic | number | string | Array<Graphic | number | string>;

type HighlightableLayerView = {
  highlight: (
    target: HighlightTarget,
    options?: {
      name?: string;
    },
  ) => HighlightHandle;
};

function getObjectId(graphic: Graphic) {
  const objectId = graphic.attributes?.OBJECTID;

  if (typeof objectId === "number" || typeof objectId === "string") {
    return objectId;
  }

  return null;
}

function isFallbackGeometry(graphic: Graphic) {
  return graphic.geometry?.type === "polyline" || graphic.geometry?.type === "polygon";
}

export function configureSelectionHighlight(view: SceneView) {
  const existingHighlight = view.highlights.find(
    (highlight) => highlight.name === SELECTED_HIGHLIGHT_NAME,
  );

  if (existingHighlight) {
    existingHighlight.color = "#facc15";
    existingHighlight.haloColor = "#facc15";
    existingHighlight.haloOpacity = 0.9;
    existingHighlight.fillOpacity = 0.15;
    return;
  }

  view.highlights.add(
    new HighlightOptions({
      name: SELECTED_HIGHLIGHT_NAME,
      color: "#facc15",
      haloColor: "#facc15",
      haloOpacity: 0.9,
      fillOpacity: 0.15,
    }),
  );
}

export class EntitySelectionManager {
  private readonly fallbackHighlightManager: EntityHighlightManager;
  private highlightHandle: HighlightHandle | null = null;

  constructor(map: Map) {
    this.fallbackHighlightManager = new EntityHighlightManager(map);
  }

  async selectFeatureByGraphic(view: SceneView, graphic: Graphic) {
    this.clearSelection();
    configureSelectionHighlight(view);

    const layer = graphic.layer;

    if (!layer) {
      this.fallbackIfAllowed(graphic);
      return;
    }

    try {
      const layerView = (await view.whenLayerView(
        layer as unknown as Layer,
      )) as unknown as HighlightableLayerView;
      const objectId = getObjectId(graphic);

      this.highlightHandle = layerView.highlight(objectId ?? graphic, {
        name: SELECTED_HIGHLIGHT_NAME,
      });
    } catch (error) {
      console.warn("ArcGIS layerView.highlight failed; using geometry fallback when allowed.", error);
      this.fallbackIfAllowed(graphic);
    }
  }

  async selectFeatureByObjectId(
    view: SceneView,
    layer: Layer,
    objectId: number | string,
  ) {
    this.clearSelection();
    configureSelectionHighlight(view);

    const layerView = (await view.whenLayerView(layer)) as unknown as HighlightableLayerView;
    this.highlightHandle = layerView.highlight(objectId, {
      name: SELECTED_HIGHLIGHT_NAME,
    });
  }

  clearSelection() {
    this.highlightHandle?.remove();
    this.highlightHandle = null;
    this.fallbackHighlightManager.clearHighlight();
  }

  dispose() {
    this.clearSelection();
    this.fallbackHighlightManager.dispose();
  }

  private fallbackIfAllowed(graphic: Graphic) {
    if (isFallbackGeometry(graphic)) {
      this.fallbackHighlightManager.highlightEntity(graphic);
    }
  }
}
