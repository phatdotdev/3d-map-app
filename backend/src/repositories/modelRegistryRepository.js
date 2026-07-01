const { modelRegistryFile } = require("../config/paths");
const { readJsonFile, writeJsonAtomic } = require("../utils/fileStorage");
const { HttpError } = require("../utils/httpError");

function emptyModelRegistry() {
  return [];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeModelRegistry(document) {
  if (!Array.isArray(document)) {
    throw new HttpError(500, "model-registry.json must be an array.");
  }

  return document.filter(isRecord).map((model) => ({
    ...model,
    id: String(model.id ?? ""),
    name: String(model.name ?? model.originalFileName ?? model.id ?? ""),
    originalFileName: String(model.originalFileName ?? ""),
    url: String(model.url ?? ""),
    type: String(model.type ?? "glb"),
    uploadedAt: String(model.uploadedAt ?? new Date().toISOString()),
    metadata: isRecord(model.metadata) ? model.metadata : {},
  })).filter((model) => model.id && model.url);
}

async function readModelRegistry() {
  const document = await readJsonFile(modelRegistryFile, emptyModelRegistry);
  return normalizeModelRegistry(document);
}

async function writeModelRegistry(models) {
  const nextModels = normalizeModelRegistry(models);
  await writeJsonAtomic(modelRegistryFile, nextModels);
  return nextModels;
}

module.exports = {
  readModelRegistry,
  writeModelRegistry,
};

