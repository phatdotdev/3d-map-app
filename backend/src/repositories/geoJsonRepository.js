const { readJsonFile, writeJsonAtomic } = require("../utils/fileStorage");
const { HttpError } = require("../utils/httpError");
const { isRecord } = require("../validators/spatialLayerValidator");

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function normalizeFeatureCollection(document) {
  if (!isRecord(document) || document.type !== "FeatureCollection") {
    throw new HttpError(500, "GeoJSON file must be a FeatureCollection.");
  }

  return {
    type: "FeatureCollection",
    features: Array.isArray(document.features)
      ? document.features.filter(isRecord)
      : [],
  };
}

async function readFeatureCollection(filePath) {
  const document = await readJsonFile(filePath, emptyFeatureCollection);
  return normalizeFeatureCollection(document);
}

async function writeFeatureCollection(filePath, collection) {
  const nextCollection = normalizeFeatureCollection(collection);
  await writeJsonAtomic(filePath, nextCollection);
  return nextCollection;
}

module.exports = {
  readFeatureCollection,
  writeFeatureCollection,
};

