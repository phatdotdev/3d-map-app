const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const { rawDataDir, rawUploadDir } = require("../config/paths");
const {
  readLayerDocument,
  writeLayerDocument,
} = require("../repositories/layerFileRepository");
const { ensureDirectory, writeJsonAtomic } = require("../utils/fileStorage");
const { toSafeFileName } = require("../utils/fileName");
const { HttpError } = require("../utils/httpError");
const {
  assertGeoJsonText,
  assertLayer,
  assertUploadedGeoJson,
  isRecord,
} = require("../validators/spatialLayerValidator");

function toFiniteNumber(value, fieldName) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new HttpError(400, `${fieldName} must be a number.`);
  }

  return numberValue;
}

function readFallbackZ(fallbackPosition) {
  if (!Array.isArray(fallbackPosition) || fallbackPosition.length < 3) {
    return 0;
  }

  const fallbackZ = Number(fallbackPosition[2]);
  return Number.isFinite(fallbackZ) ? fallbackZ : 0;
}

function normalizePosition(position, fallbackPosition, fieldName) {
  if (!Array.isArray(position) || position.length < 2) {
    throw new HttpError(400, `${fieldName} must be [longitude, latitude, z?].`);
  }

  const z =
    position[2] === undefined
      ? readFallbackZ(fallbackPosition)
      : toFiniteNumber(position[2], `${fieldName}[2]`);

  return [
    toFiniteNumber(position[0], `${fieldName}[0]`),
    toFiniteNumber(position[1], `${fieldName}[1]`),
    z,
  ];
}

function normalizeCoordinates(coordinates, fallbackCoordinates, depth, fieldName) {
  if (depth === 0) {
    return normalizePosition(coordinates, fallbackCoordinates, fieldName);
  }

  if (!Array.isArray(coordinates)) {
    throw new HttpError(400, `${fieldName} must be an array.`);
  }

  return coordinates.map((item, index) =>
    normalizeCoordinates(
      item,
      Array.isArray(fallbackCoordinates) ? fallbackCoordinates[index] : undefined,
      depth - 1,
      `${fieldName}[${index}]`,
    ),
  );
}

function getGeometryCoordinateDepth(geometryType) {
  if (geometryType === "Point") return 0;
  if (geometryType === "LineString") return 1;
  if (geometryType === "Polygon") return 2;
  return 3;
}

function assertGeoJsonGeometryPayload(payload, geometryType, fallbackGeometry) {
  const geometry = payload?.geometry;

  if (!isRecord(geometry)) {
    throw new HttpError(400, "Missing GeoJSON geometry payload.");
  }

  if (geometry.type !== geometryType) {
    throw new HttpError(400, `GeoJSON geometry does not match ${geometryType}.`);
  }

  if (!Array.isArray(geometry.coordinates)) {
    throw new HttpError(400, "GeoJSON geometry requires coordinates.");
  }

  return {
    type: geometry.type,
    coordinates: normalizeCoordinates(
      geometry.coordinates,
      fallbackGeometry?.type === geometry.type
        ? fallbackGeometry.coordinates
        : undefined,
      getGeometryCoordinateDepth(geometry.type),
      "coordinates",
    ),
  };
}

function resolveLayerSourceFile(sourcePath) {
  if (typeof sourcePath !== "string" || !sourcePath) {
    throw new HttpError(400, "Layer sourcePath is invalid.");
  }

  const rawPrefix = "/raw/";
  const dataRawPrefix = "/data/raw/";
  const relativePath = sourcePath.startsWith(dataRawPrefix)
    ? sourcePath.slice(dataRawPrefix.length)
    : sourcePath.startsWith(rawPrefix)
      ? sourcePath.slice(rawPrefix.length)
      : null;

  if (!relativePath) {
    throw new HttpError(400, "Layer sourcePath must point to raw GeoJSON data.");
  }

  const filePath = path.resolve(rawDataDir, decodeURIComponent(relativePath));
  const rootPath = path.resolve(rawDataDir);
  const normalizedFilePath = filePath.toLowerCase();
  const normalizedRootPath = rootPath.toLowerCase();

  if (
    normalizedFilePath !== normalizedRootPath &&
    !normalizedFilePath.startsWith(`${normalizedRootPath}${path.sep}`)
  ) {
    throw new HttpError(400, "Layer sourcePath is outside the raw data directory.");
  }

  return filePath;
}

function readStoredFeatureId(feature, layer, index) {
  const properties = isRecord(feature?.properties) ? feature.properties : {};
  const configuredField = layer.fields?.idField;
  const configuredId = configuredField ? properties[configuredField] : undefined;

  if (typeof configuredId === "string" || typeof configuredId === "number") {
    return configuredId;
  }

  if (typeof feature?.id === "string" || typeof feature?.id === "number") {
    return feature.id;
  }

  return `${layer.id}-${index + 1}`;
}

async function readGeoJsonCollection(filePath) {
  let parsed;

  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new HttpError(500, "Layer GeoJSON source is not valid JSON.");
    }

    throw error;
  }

  if (!isRecord(parsed) || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new HttpError(500, "Layer GeoJSON source must be a FeatureCollection.");
  }

  return parsed;
}

async function writeUploadedGeoJson(geoJsonFile, geometryType) {
  assertGeoJsonText(geoJsonFile.text, geometryType);

  const safeFileName = toSafeFileName(geoJsonFile.fileName);
  await ensureDirectory(rawUploadDir);
  await writeFile(path.join(rawUploadDir, safeFileName), geoJsonFile.text, "utf8");

  return `/data/raw/uploads/${safeFileName}`;
}

async function listLayers() {
  return readLayerDocument();
}

async function createLayer(payload) {
  const layer = assertLayer(payload?.layer);
  const geoJsonFile = assertUploadedGeoJson(payload?.geoJsonFile);

  if (!geoJsonFile) {
    throw new HttpError(400, "Creating a layer requires a GeoJSON file.");
  }

  const document = await readLayerDocument();

  if (document.layers.some((item) => item.id === layer.id)) {
    throw new HttpError(409, "Layer id already exists.");
  }

  const sourcePath = await writeUploadedGeoJson(geoJsonFile, layer.geometryType);

  return writeLayerDocument({
    ...document,
    layers: [
      ...document.layers,
      {
        ...layer,
        sourcePath,
      },
    ],
  });
}

async function updateLayer(layerId, payload) {
  if (!layerId) {
    throw new HttpError(400, "Missing layer id.");
  }

  const layer = {
    ...assertLayer(payload?.layer),
    id: layerId,
  };
  const geoJsonFile = assertUploadedGeoJson(payload?.geoJsonFile);
  const document = await readLayerDocument();
  const layerIndex = document.layers.findIndex((item) => item.id === layerId);

  if (layerIndex < 0) {
    throw new HttpError(404, "Layer was not found.");
  }

  const existingLayer = document.layers[layerIndex];
  const sourcePath = geoJsonFile
    ? await writeUploadedGeoJson(geoJsonFile, layer.geometryType)
    : layer.sourcePath || existingLayer.sourcePath;

  if (typeof sourcePath !== "string" || !sourcePath) {
    throw new HttpError(400, "Layer requires sourcePath when no file is uploaded.");
  }

  const nextLayers = [...document.layers];
  nextLayers[layerIndex] = {
    ...layer,
    sourcePath,
  };

  return writeLayerDocument({
    ...document,
    layers: nextLayers,
  });
}

async function updateLayerFeatureGeometry(layerId, featureId, payload) {
  if (!layerId || !featureId) {
    throw new HttpError(400, "Missing layer id or feature id.");
  }

  const document = await readLayerDocument();
  const layer = document.layers.find((item) => item.id === layerId);

  if (!layer) {
    throw new HttpError(404, "Layer was not found.");
  }

  const sourceFile = resolveLayerSourceFile(layer.sourcePath);
  const collection = await readGeoJsonCollection(sourceFile);
  const featureIndex = collection.features.findIndex((feature, index) => {
    return String(readStoredFeatureId(feature, layer, index)) === String(featureId);
  });

  if (featureIndex < 0) {
    throw new HttpError(404, "Feature was not found in layer source.");
  }

  const geometry = assertGeoJsonGeometryPayload(
    payload,
    layer.geometryType,
    collection.features[featureIndex]?.geometry,
  );
  const nextFeatures = [...collection.features];
  nextFeatures[featureIndex] = {
    ...nextFeatures[featureIndex],
    geometry,
  };

  const nextCollection = {
    ...collection,
    features: nextFeatures,
  };

  await writeJsonAtomic(sourceFile, nextCollection);

  return {
    layerId,
    featureId,
    geometry,
  };
}

async function deleteLayer(layerId) {
  if (!layerId) {
    throw new HttpError(400, "Missing layer id.");
  }

  const document = await readLayerDocument();
  const nextLayers = document.layers.filter((item) => item.id !== layerId);

  if (nextLayers.length === document.layers.length) {
    throw new HttpError(404, "Layer was not found.");
  }

  return writeLayerDocument({
    ...document,
    layers: nextLayers,
  });
}

module.exports = {
  createLayer,
  deleteLayer,
  listLayers,
  updateLayer,
  updateLayerFeatureGeometry,
};
