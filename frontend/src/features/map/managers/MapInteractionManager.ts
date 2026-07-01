import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import SceneView from "@arcgis/core/views/SceneView";

type MapInteractionManagerOptions = {
  view: SceneView;
  pinLayer: FeatureLayer | null;
  modelLayer: FeatureLayer;
  independentGeometryLayers?: Array<FeatureLayer | null>;
  isEditing: () => boolean;
  onCreateClick?: (location: Point | null) => boolean;
  onModelClick: (feature: Graphic, location: Point | null) => void;
  onPinClick: (feature: Graphic, location: Point | null) => void;
  onIndependentGeometryClick?: (feature: Graphic, location: Point | null) => void;
  onMapClear: () => void;
};

export class MapInteractionManager {
  private readonly view: SceneView;
  private readonly pinLayer: FeatureLayer | null;
  private readonly modelLayer: FeatureLayer;
  private readonly independentGeometryLayers: FeatureLayer[];
  private readonly isEditing: () => boolean;
  private readonly onCreateClick?: (location: Point | null) => boolean;
  private readonly onModelClick: (
    feature: Graphic,
    location: Point | null,
  ) => void;
  private readonly onPinClick: (
    feature: Graphic,
    location: Point | null,
  ) => void;
  private readonly onIndependentGeometryClick?: (
    feature: Graphic,
    location: Point | null,
  ) => void;
  private readonly onMapClear: () => void;
  private clickHandle: { remove: () => void } | null = null;

  constructor(options: MapInteractionManagerOptions) {
    this.view = options.view;
    this.pinLayer = options.pinLayer;
    this.modelLayer = options.modelLayer;
    this.independentGeometryLayers = (
      options.independentGeometryLayers ?? []
    ).filter((layer): layer is FeatureLayer => layer !== null);
    this.isEditing = options.isEditing;
    this.onCreateClick = options.onCreateClick;
    this.onModelClick = options.onModelClick;
    this.onPinClick = options.onPinClick;
    this.onIndependentGeometryClick = options.onIndependentGeometryClick;
    this.onMapClear = options.onMapClear;
  }

  initialize() {
    this.clickHandle = this.view.on("click", async (event) => {
      if (this.isEditing()) return;

      if (this.onCreateClick?.(event.mapPoint) === true) {
        return;
      }

      const response = await this.view.hitTest(event);
      const modelResult = response.results.find((item) => {
        return item.type === "graphic" && item.graphic.layer === this.modelLayer;
      });

      if (modelResult?.type === "graphic") {
        this.onModelClick(modelResult.graphic, event.mapPoint);
        return;
      }

      const pinResult = response.results.find((item) => {
        return item.type === "graphic" && item.graphic.layer === this.pinLayer;
      });

      if (pinResult?.type === "graphic") {
        this.onPinClick(pinResult.graphic, event.mapPoint);
        return;
      }

      const independentGeometryResult = response.results.find((item) => {
        return (
          item.type === "graphic" &&
          this.independentGeometryLayers.some(
            (layer) => item.graphic.layer === layer,
          )
        );
      });

      if (independentGeometryResult?.type === "graphic") {
        this.onIndependentGeometryClick?.(
          independentGeometryResult.graphic,
          event.mapPoint,
        );
        return;
      }

      const spatialLayerResult = response.results.find((item) => {
        if (item.type !== "graphic") return false;

        return Boolean(item.graphic.attributes?.sourceLayerId);
      });

      if (spatialLayerResult) {
        return;
      }

      this.onMapClear();
    });
  }

  dispose() {
    this.clickHandle?.remove();
    this.clickHandle = null;
  }
}
