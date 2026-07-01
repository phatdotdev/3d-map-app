import Graphic, { type GraphicProperties } from "@arcgis/core/Graphic";
import Map from "@arcgis/core/Map";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import type {
  CreationCoordinate,
  IndependentCreationMode,
  IndependentEntityFeature,
  IndependentEntityType,
} from "../types/independentEntity";
import { createMapPinSvgDataUrl } from "../../../utils/map-render/mapPinSvg";

export const INDEPENDENT_CREATION_PREVIEW_LAYER_ID =
  "independent-creation-preview-layer";

type GraphicSymbol = NonNullable<GraphicProperties["symbol"]>;

type CreationResult =
  | {
      status: "vertex-added";
      vertices: CreationCoordinate[];
    }
  | {
      status: "finished";
      vertices: CreationCoordinate[];
      feature: IndependentEntityFeature;
    };

export type ModelCreationTemplate = {
  modelId?: string;
  modelUrl: string;
  name?: string;
};

const VERTEX_CLOSE_TOLERANCE = 0.00008;

function toEntityType(mode: IndependentCreationMode): IndependentEntityType | null {
  switch (mode) {
    case "creating-point":
      return "point";
    case "creating-model3d":
      return "model3d";
    case "creating-linestring":
      return "linestring";
    case "creating-polygon":
      return "polygon";
    case "creating-multipolygon":
      return "multipolygon";
    default:
      return null;
  }
}

function makeEntityId(type: IndependentEntityType) {
  return `ind-${type}-${Date.now()}`;
}

function closeRing(vertices: CreationCoordinate[]): CreationCoordinate[] {
  if (vertices.length === 0) {
    return vertices;
  }

  const first = vertices[0];
  const last = vertices[vertices.length - 1];

  if (first[0] === last[0] && first[1] === last[1] && first[2] === last[2]) {
    return vertices;
  }

  return [...vertices, [first[0], first[1], first[2]]];
}

function getDistance(first: CreationCoordinate, second: CreationCoordinate) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function createVertexSymbol(): GraphicSymbol {
  return {
    type: "point-3d",
    symbolLayers: [
      {
        type: "icon",
        resource: {
          href: createMapPinSvgDataUrl("#facc15"),
        },
        material: {
          color: "#facc15",
        },
        size: 22,
        outline: {
          color: "#ffffff",
          size: 1,
        },
      },
    ],
    verticalOffset: {
      screenLength: 8,
      maxWorldLength: 40,
      minWorldLength: 0,
    },
    callout: {
      type: "line",
      color: "#facc15",
      size: 1,
    },
  } as GraphicSymbol;
}

function createPreviewLineSymbol(): GraphicSymbol {
  return {
    type: "simple-line",
    color: "#facc15",
    width: 4,
    style: "dash",
    cap: "round",
    join: "round",
  } as GraphicSymbol;
}

function createPreviewPolygonSymbol(): GraphicSymbol {
  return {
    type: "simple-fill",
    color: "rgba(250, 204, 21, 0.16)",
    outline: {
      color: "#facc15",
      width: 3,
    },
  } as GraphicSymbol;
}

function toPointGeometry(vertex: CreationCoordinate) {
  return new Point({
    longitude: vertex[0],
    latitude: vertex[1],
    z: vertex[2],
    spatialReference: {
      wkid: 4326,
    },
  });
}

function createLineGeometry(vertices: CreationCoordinate[]) {
  return new Polyline({
    paths: [vertices],
    hasZ: true,
    spatialReference: {
      wkid: 4326,
    },
  });
}

function createPolygonGeometry(vertices: CreationCoordinate[]) {
  return new Polygon({
    rings: [closeRing(vertices)],
    hasZ: true,
    spatialReference: {
      wkid: 4326,
    },
  });
}

function createFeatureFromVertices(
  type: IndependentEntityType,
  vertices: CreationCoordinate[],
  modelTemplate?: ModelCreationTemplate | null,
): IndependentEntityFeature {
  const id = makeEntityId(type);
  const baseProperties = {
    id,
    name: `New ${type}`,
    entityType: type,
    metadata: {},
  };

  if (type === "point" || type === "model3d") {
    const coordinate = vertices[0];

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: coordinate,
      },
      properties:
        type === "model3d"
          ? {
              ...baseProperties,
              name: modelTemplate?.name ?? baseProperties.name,
              modelId: modelTemplate?.modelId,
              modelUrl: modelTemplate?.modelUrl ?? "/models/manhole.glb",
              scale: 20,
              rotation: {
                heading: 0,
                tilt: 0,
                roll: 0,
              },
              style: {
                pinColor: "#ef4444",
                pinSize: 36,
              },
            }
          : {
              ...baseProperties,
              style: {
                color: "#ef4444",
                size: 32,
                iconUrl: "/icons/map-pin.svg",
              },
            },
    };
  }

  if (type === "linestring") {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: vertices,
      },
      properties: {
        ...baseProperties,
        style: {
          color: "#2563eb",
          width: 2,
          flatWidth: 4,
          pipeWidth: 2,
          profile: "circle",
        },
      },
    };
  }

  if (type === "polygon") {
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [closeRing(vertices)],
      },
      properties: {
        ...baseProperties,
        style: {
          fillColor: "rgba(37, 99, 235, 0.25)",
          outlineColor: "#2563eb",
          outlineWidth: 2,
        },
      },
    };
  }

  return {
    type: "Feature",
    geometry: {
      type: "MultiPolygon",
      coordinates: [[closeRing(vertices)]],
    },
    properties: {
      ...baseProperties,
      style: {
        fillColor: "rgba(245, 158, 11, 0.25)",
        outlineColor: "#f59e0b",
        outlineWidth: 2,
      },
    },
  };
}

export class IndependentCreationManager {
  private readonly map: Map;
  private readonly layer: GraphicsLayer;
  private mode: IndependentCreationMode = "idle";
  private vertices: CreationCoordinate[] = [];
  private modelTemplate: ModelCreationTemplate | null = null;

  constructor(map: Map) {
    this.map = map;
    this.layer = this.getOrCreatePreviewLayer();
  }

  start(mode: IndependentCreationMode) {
    this.mode = mode;
    this.vertices = [];
    this.renderPreview();
  }

  setModelTemplate(modelTemplate: ModelCreationTemplate | null) {
    this.modelTemplate = modelTemplate;
  }

  handleMapClick(point: Point | null): CreationResult | null {
    const entityType = toEntityType(this.mode);

    if (!point || !entityType) {
      return null;
    }

    const longitude = point.longitude;
    const latitude = point.latitude;

    if (
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      return null;
    }

    const coordinate: CreationCoordinate = [
      longitude,
      latitude,
      Number.isFinite(point.z) ? Number(point.z) : 0,
    ];

    if (entityType === "point" || entityType === "model3d") {
      this.vertices = [coordinate];
      this.renderPreview();

      return {
        status: "finished",
        vertices: this.vertices,
        feature: createFeatureFromVertices(
          entityType,
          this.vertices,
          this.modelTemplate,
        ),
      };
    }

    const existingVertexIndex = this.vertices.findIndex(
      (vertex) => getDistance(vertex, coordinate) <= VERTEX_CLOSE_TOLERANCE,
    );
    const minimumVertices = entityType === "linestring" ? 2 : 3;

    if (existingVertexIndex >= 0 && this.vertices.length >= minimumVertices) {
      const feature = createFeatureFromVertices(
        entityType,
        this.vertices,
        this.modelTemplate,
      );
      this.renderPreview();

      return {
        status: "finished",
        vertices: this.vertices,
        feature,
      };
    }

    this.vertices = [...this.vertices, coordinate];
    this.renderPreview();

    return {
      status: "vertex-added",
      vertices: this.vertices,
    };
  }

  clearPreview() {
    this.vertices = [];
    this.mode = "idle";
    this.layer.graphics.removeAll();
  }

  dispose() {
    this.clearPreview();
  }

  private getOrCreatePreviewLayer() {
    const existingLayer = this.map.findLayerById(
      INDEPENDENT_CREATION_PREVIEW_LAYER_ID,
    ) as GraphicsLayer | null;

    if (existingLayer) {
      this.map.reorder(existingLayer, this.map.layers.length - 1);
      return existingLayer;
    }

    const layer = new GraphicsLayer({
      id: INDEPENDENT_CREATION_PREVIEW_LAYER_ID,
      title: "Independent creation preview",
      elevationInfo: {
        mode: "absolute-height",
      },
    });

    this.map.add(layer);
    this.map.reorder(layer, this.map.layers.length - 1);
    return layer;
  }

  private renderPreview() {
    this.layer.graphics.removeAll();

    const vertexSymbol = createVertexSymbol();

    this.vertices.forEach((vertex, index) => {
      this.layer.graphics.add(
        new Graphic({
          geometry: toPointGeometry(vertex),
          symbol: vertexSymbol,
          attributes: {
            previewVertexIndex: index,
          },
        }),
      );
    });

    if (this.vertices.length >= 2) {
      this.layer.graphics.add(
        new Graphic({
          geometry: createLineGeometry(this.vertices),
          symbol: createPreviewLineSymbol(),
          attributes: {
            previewGeometry: true,
          },
        }),
      );
    }

    if (
      (this.mode === "creating-polygon" ||
        this.mode === "creating-multipolygon") &&
      this.vertices.length >= 3
    ) {
      this.layer.graphics.add(
        new Graphic({
          geometry: createPolygonGeometry(this.vertices),
          symbol: createPreviewPolygonSymbol(),
          attributes: {
            previewGeometry: true,
          },
        }),
      );
    }

    this.map.reorder(this.layer, this.map.layers.length - 1);
  }
}
