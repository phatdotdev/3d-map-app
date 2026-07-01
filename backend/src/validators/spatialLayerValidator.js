const { HttpError } = require("../utils/httpError");

const SUPPORTED_GEOMETRY_TYPES = new Set([
  "Point",
  "LineString",
  "Polygon",
  "MultiPolygon",
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertLayer(value) {
  if (!isRecord(value)) {
    throw new HttpError(400, "Missing layer payload.");
  }

  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new HttpError(400, "Layer requires a non-empty id.");
  }

  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new HttpError(400, "Layer requires a non-empty name.");
  }

  if (value.sourceType !== "geojson") {
    throw new HttpError(400, "Layer sourceType must be geojson.");
  }

  if (!SUPPORTED_GEOMETRY_TYPES.has(value.geometryType)) {
    throw new HttpError(400, "Layer geometryType is not supported.");
  }

  return {
    ...value,
    id: value.id.trim(),
    name: value.name.trim(),
  };
}

function assertUploadedGeoJson(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new HttpError(400, "GeoJSON upload payload is invalid.");
  }

  if (typeof value.fileName !== "string" || typeof value.text !== "string") {
    throw new HttpError(400, "GeoJSON upload requires fileName and text.");
  }

  const fileName = value.fileName.toLowerCase();
  if (!fileName.endsWith(".geojson") && !fileName.endsWith(".json")) {
    throw new HttpError(400, "Only .geojson or .json files are supported.");
  }

  return {
    fileName: value.fileName,
    text: value.text,
  };
}

function assertGeoJsonText(text, geometryType) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "GeoJSON file is not valid JSON.");
  }

  if (!isRecord(parsed) || parsed.type !== "FeatureCollection") {
    throw new HttpError(400, "GeoJSON file must be a FeatureCollection.");
  }

  if (!Array.isArray(parsed.features) || parsed.features.length === 0) {
    throw new HttpError(400, "GeoJSON file must include at least one feature.");
  }

  const invalidFeature = parsed.features.find((feature) => {
    if (!isRecord(feature)) return true;
    const geometry = feature.geometry;
    if (geometry === null) return false;
    return !isRecord(geometry) || geometry.type !== geometryType;
  });

  if (invalidFeature) {
    throw new HttpError(400, `GeoJSON geometry does not match ${geometryType}.`);
  }

  return parsed;
}

module.exports = {
  assertGeoJsonText,
  assertLayer,
  assertUploadedGeoJson,
  isRecord,
};

