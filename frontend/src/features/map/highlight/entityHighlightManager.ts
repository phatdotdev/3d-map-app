import Graphic from "@arcgis/core/Graphic";
import Map from "@arcgis/core/Map";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import type {
  CreationCoordinate,
  GeoJsonPosition,
  IndependentEntityFeature,
} from "../types/independentEntity";

export const SELECTION_HIGHLIGHT_LAYER_ID = "selection-highlight-layer";
const LINE_HIGHLIGHT_WIDTH = 6;

type HighlightableEntity = IndependentEntityFeature | Graphic;

function toCoordinate(position: GeoJsonPosition): CreationCoordinate {
  return [position[0], position[1], position[2] ?? 0];
}

function getOrCreateHighlightLayer(map: Map) {
  const existingLayer = map.findLayerById(
    SELECTION_HIGHLIGHT_LAYER_ID,
  ) as GraphicsLayer | null;

  if (existingLayer) {
    map.reorder(existingLayer, map.layers.length - 1);
    return existingLayer;
  }

  const layer = new GraphicsLayer({
    id: SELECTION_HIGHLIGHT_LAYER_ID,
    title: "Selection highlight",
    elevationInfo: {
      mode: "absolute-height",
    },
  });

  map.add(layer);
  map.reorder(layer, map.layers.length - 1);
  return layer;
}

function polylineGeometryFromFeature(feature: IndependentEntityFeature) {
  if (feature.geometry.type !== "LineString") return null;

  return new Polyline({
    paths: [feature.geometry.coordinates.map(toCoordinate)],
    hasZ: true,
    spatialReference: {
      wkid: 4326,
    },
  });
}

function polygonGeometryFromFeature(feature: IndependentEntityFeature) {
  if (feature.geometry.type === "Polygon") {
    return new Polygon({
      rings: feature.geometry.coordinates.map((ring) => ring.map(toCoordinate)),
      hasZ: true,
      spatialReference: {
        wkid: 4326,
      },
    });
  }

  if (feature.geometry.type === "MultiPolygon") {
    return new Polygon({
      rings: feature.geometry.coordinates.flatMap((polygon) =>
        polygon.map((ring) => ring.map(toCoordinate)),
      ),
      hasZ: true,
      spatialReference: {
        wkid: 4326,
      },
    });
  }

  return null;
}

function isIndependentFeature(entity: HighlightableEntity): entity is IndependentEntityFeature {
  return "type" in entity && entity.type === "Feature";
}

export function createLineHighlightGraphic(entity: HighlightableEntity) {
  const geometry = isIndependentFeature(entity)
    ? polylineGeometryFromFeature(entity)
    : entity.geometry;

  if (!geometry || geometry.type !== "polyline") {
    return null;
  }

  return new Graphic({
    geometry,
    symbol: {
      type: "line-3d",
      symbolLayers: [
        {
          type: "path",
          profile: "circle",
          anchor: "bottom",
          width: LINE_HIGHLIGHT_WIDTH,
          height: LINE_HIGHLIGHT_WIDTH,
          material: {
            color: [250, 204, 21, 0.72],
          },
          cap: "round",
          join: "round",
        },
      ],
    },
    attributes: {
      highlight: true,
    },
  });
}

export function createPolygonHighlightGraphic(entity: HighlightableEntity) {
  const geometry = isIndependentFeature(entity)
    ? polygonGeometryFromFeature(entity)
    : entity.geometry;

  if (!geometry || geometry.type !== "polygon") {
    return null;
  }

  return new Graphic({
    geometry,
    symbol: {
      type: "simple-fill",
      color: "rgba(250, 204, 21, 0.08)",
      outline: {
        color: "#facc15",
        width: 6,
      },
    },
    attributes: {
      highlight: true,
    },
  });
}

export function createMultiPolygonHighlightGraphic(entity: HighlightableEntity) {
  return createPolygonHighlightGraphic(entity);
}

export class EntityHighlightManager {
  private readonly map: Map;
  private readonly layer: GraphicsLayer;

  constructor(map: Map) {
    this.map = map;
    this.layer = getOrCreateHighlightLayer(map);
  }

  highlightEntity(entity: HighlightableEntity) {
    this.clearHighlight();

    const graphic = this.createHighlightGraphic(entity);

    if (!graphic) return;

    this.layer.graphics.add(graphic);
    this.map.reorder(this.layer, this.map.layers.length - 1);
  }

  clearHighlight() {
    this.layer.graphics.removeAll();
  }

  dispose() {
    this.clearHighlight();
  }

  private createHighlightGraphic(entity: HighlightableEntity) {
    if (isIndependentFeature(entity)) {
      if (entity.geometry.type === "Point") {
        return null;
      }

      if (entity.geometry.type === "LineString") {
        return createLineHighlightGraphic(entity);
      }

      if (entity.geometry.type === "Polygon") {
        return createPolygonHighlightGraphic(entity);
      }

      return createMultiPolygonHighlightGraphic(entity);
    }

    if (entity.geometry?.type === "polyline") {
      return createLineHighlightGraphic(entity);
    }

    if (entity.geometry?.type === "polygon") {
      return createPolygonHighlightGraphic(entity);
    }

    return null;
  }
}
