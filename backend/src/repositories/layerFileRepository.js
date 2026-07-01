const { layerDataFile } = require("../config/paths");
const { readJsonFile, writeJsonAtomic } = require("../utils/fileStorage");
const { HttpError } = require("../utils/httpError");
const { isRecord } = require("../validators/spatialLayerValidator");

function emptyLayerDocument() {
  return {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    layers: [],
  };
}

function normalizeLayerDocument(document) {
  if (!isRecord(document) || !Array.isArray(document.layers)) {
    throw new HttpError(500, "layer-data.json does not match expected schema.");
  }

  return {
    version: typeof document.version === "string" ? document.version : "1.0.0",
    updatedAt:
      typeof document.updatedAt === "string" ? document.updatedAt : undefined,
    layers: document.layers.filter(isRecord),
  };
}

async function readLayerDocument() {
  const document = await readJsonFile(layerDataFile, emptyLayerDocument);
  return normalizeLayerDocument(document);
}

async function writeLayerDocument(document) {
  const nextDocument = normalizeLayerDocument({
    ...document,
    updatedAt: new Date().toISOString(),
  });

  await writeJsonAtomic(layerDataFile, nextDocument);
  return nextDocument;
}

module.exports = {
  readLayerDocument,
  writeLayerDocument,
};

