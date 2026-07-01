import type { GraphicProperties } from "@arcgis/core/Graphic";

import {
  DEFAULT_ICON_DISPLAY,
  DEFAULT_LINE_DISPLAY,
  DEFAULT_MODEL_DISPLAY,
  DEFAULT_POLYGON_DISPLAY,
} from "../constants/layer-defaults";
import type {
  SpatialIconDisplayConfig,
  SpatialLayerConfig,
  SpatialPointDisplayMode,
} from "../types/spatial-layer.types";
import { hexToRgba } from "../utils/colorUtils";

type GraphicSymbol = NonNullable<GraphicProperties["symbol"]>;

function createPinSvgDataUri(icon: SpatialIconDisplayConfig) {
  const color = icon.color ?? DEFAULT_ICON_DISPLAY.color;
  const outlineColor = icon.outlineColor ?? DEFAULT_ICON_DISPLAY.outlineColor;
  const outlineWidth = icon.outlineWidth ?? DEFAULT_ICON_DISPLAY.outlineWidth;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M24 44s15-14.2 15-26A15 15 0 1 0 9 18c0 11.8 15 26 15 26Z" fill="${color}" stroke="${outlineColor}" stroke-width="${outlineWidth}" stroke-linejoin="round"/>
  <circle cx="24" cy="18" r="5.5" fill="${outlineColor}"/>
</svg>`.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getPointIconHref(icon: SpatialIconDisplayConfig) {
  if (icon.color) {
    return createPinSvgDataUri(icon);
  }

  return icon.url;
}

export function createPointModelSymbol(config: SpatialLayerConfig): GraphicSymbol {
  const display = config.display;
  const model = display.model ?? DEFAULT_MODEL_DISPLAY;

  return {
    type: "point-3d",
    symbolLayers: [
      {
        type: "object",
        resource: {
          href: model.url,
        },
        width: model.width,
        height: model.height,
        depth: model.depth,
        heading: model.heading ?? 0,
        tilt: model.tilt ?? 0,
        roll: model.roll ?? 0,
      },
    ],
  } as GraphicSymbol;
}

export function createPointIconSymbol(config: SpatialLayerConfig): GraphicSymbol {
  const display = config.display;
  const icon = display.icon ?? DEFAULT_ICON_DISPLAY;

  return {
    type: "point-3d",
    symbolLayers: [
      {
        type: "icon",
        resource: {
          href: getPointIconHref(icon),
        },
        material: {
          color: icon.color ?? DEFAULT_ICON_DISPLAY.color,
        },
        size: Math.max(icon.width, icon.height),
        outline: {
          color: icon.outlineColor ?? DEFAULT_ICON_DISPLAY.outlineColor,
          size: icon.outlineWidth ?? DEFAULT_ICON_DISPLAY.outlineWidth,
        },
      },
    ],
    verticalOffset: {
      screenLength: 12,
      maxWorldLength: 60,
      minWorldLength: 8,
    },
    callout: {
      type: "line",
      color: "#ffffff",
      size: 1,
    },
  } as GraphicSymbol;
}

export function createPointSymbol(
  config: SpatialLayerConfig,
  preferredMode?: SpatialPointDisplayMode,
): GraphicSymbol {
  const display = config.display;
  const model = display.model ?? DEFAULT_MODEL_DISPLAY;
  const mode = preferredMode ?? display.mode;

  if (mode === "model" && model.enabled) {
    return createPointModelSymbol(config);
  }

  return createPointIconSymbol(config);
}

export function createLineFlatSymbol(config: SpatialLayerConfig): GraphicSymbol {
  const line = config.display.line ?? DEFAULT_LINE_DISPLAY;
  const width =
    line.flatWidth ??
    line.width ??
    DEFAULT_LINE_DISPLAY.flatWidth ??
    DEFAULT_LINE_DISPLAY.width;

  return {
    type: "simple-line",
    color: line.color ?? DEFAULT_LINE_DISPLAY.color,
    width,
    style: line.style ?? DEFAULT_LINE_DISPLAY.style,
    cap: line.cap ?? DEFAULT_LINE_DISPLAY.cap,
    join: line.join ?? DEFAULT_LINE_DISPLAY.join,
  } as GraphicSymbol;
}

export function createLinePipeSymbol(config: SpatialLayerConfig): GraphicSymbol {
  const line = config.display.line ?? DEFAULT_LINE_DISPLAY;
  const width = Number(
    line.pipeWidth ??
      line.width ??
      DEFAULT_LINE_DISPLAY.pipeWidth ??
      DEFAULT_LINE_DISPLAY.width,
  );
  const pipeWidth =
    Number.isFinite(width) && width > 0
      ? width
      : (DEFAULT_LINE_DISPLAY.pipeWidth ?? DEFAULT_LINE_DISPLAY.width);

  return {
    type: "line-3d",
    symbolLayers: [
      {
        type: "path",
        profile: line.profile ?? DEFAULT_LINE_DISPLAY.profile,
        anchor: "bottom",
        width: pipeWidth,
        height: pipeWidth,
        material: {
          color: line.color ?? DEFAULT_LINE_DISPLAY.color,
        },
        cap: line.cap ?? DEFAULT_LINE_DISPLAY.cap,
        join: line.join ?? DEFAULT_LINE_DISPLAY.join,
      },
    ],
  } as GraphicSymbol;
}

export function createLineSymbol(config: SpatialLayerConfig): GraphicSymbol {
  return createLineFlatSymbol(config);
}

export function createPolygonSymbol(config: SpatialLayerConfig): GraphicSymbol {
  const polygon = config.display.polygon ?? DEFAULT_POLYGON_DISPLAY;

  return {
    type: "simple-fill",
    color: hexToRgba(polygon.fillColor, polygon.fillOpacity),
    outline: {
      color: polygon.outlineColor,
      width: polygon.outlineWidth,
    },
  } as GraphicSymbol;
}
