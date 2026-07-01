export type ArcGISRgbaColor = [number, number, number, number];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function expandShortHex(hex: string) {
  return hex
    .split("")
    .map((part) => `${part}${part}`)
    .join("");
}

export function hexToRgba(
  color: string,
  opacity = 1,
  fallback: ArcGISRgbaColor = [0, 0, 0, opacity],
): ArcGISRgbaColor {
  const normalizedColor = color.trim().replace(/^#/, "");
  const hex =
    normalizedColor.length === 3
      ? expandShortHex(normalizedColor)
      : normalizedColor;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return fallback;
  }

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    clamp(opacity, 0, 1),
  ];
}
