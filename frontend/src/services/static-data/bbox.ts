import Extent from "@arcgis/core/geometry/Extent";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import type SceneView from "@arcgis/core/views/SceneView";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";

export type BboxArray = [number, number, number, number];

const WGS84 = new SpatialReference({ wkid: 4326 });
const DEFAULT_VIEW_BBOX_PADDING_RATIO = 0.35;
const DEFAULT_VIEW_BBOX_MIN_PADDING_DEGREES = 0.001;

type ViewBboxOptions = {
  paddingRatio?: number;
  minPaddingDegrees?: number;
};

export function parseBbox(value?: string | BboxArray | null): BboxArray | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value;
  }

  const parts = value.split(",").map((part) => Number(part.trim()));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return parts as BboxArray;
}

export function bboxToString(bbox: BboxArray | null) {
  return bbox ? bbox.join(",") : undefined;
}

export function bboxIntersects(first: BboxArray, second: BboxArray) {
  return (
    first[0] <= second[2] &&
    first[2] >= second[0] &&
    first[1] <= second[3] &&
    first[3] >= second[1]
  );
}

export function expandBbox(
  bbox: BboxArray,
  options: ViewBboxOptions = {},
): BboxArray {
  const paddingRatio =
    options.paddingRatio ?? DEFAULT_VIEW_BBOX_PADDING_RATIO;
  const minPaddingDegrees =
    options.minPaddingDegrees ?? DEFAULT_VIEW_BBOX_MIN_PADDING_DEGREES;
  const longitudePadding = Math.max(
    (bbox[2] - bbox[0]) * paddingRatio,
    minPaddingDegrees,
  );
  const latitudePadding = Math.max(
    (bbox[3] - bbox[1]) * paddingRatio,
    minPaddingDegrees,
  );

  return [
    bbox[0] - longitudePadding,
    bbox[1] - latitudePadding,
    bbox[2] + longitudePadding,
    bbox[3] + latitudePadding,
  ];
}

export function getViewBbox(
  view: SceneView | null,
  options?: ViewBboxOptions,
): BboxArray | null {
  const extent = view?.extent;

  if (!extent) return null;

  const geographicExtent = webMercatorUtils.canProject(extent, WGS84)
    ? (webMercatorUtils.project(extent, WGS84) as Extent)
    : extent;

  if (
    !Number.isFinite(geographicExtent.xmin) ||
    !Number.isFinite(geographicExtent.ymin) ||
    !Number.isFinite(geographicExtent.xmax) ||
    !Number.isFinite(geographicExtent.ymax)
  ) {
    return null;
  }

  return expandBbox([
    geographicExtent.xmin,
    geographicExtent.ymin,
    geographicExtent.xmax,
    geographicExtent.ymax,
  ], options);
}
