const { readdir, readFile, rm, stat, writeFile } = require("node:fs/promises");
const path = require("node:path");

const { independentEntitiesFile, modelsDir } = require("../config/paths");
const {
  readModelRegistry,
  writeModelRegistry,
} = require("../repositories/modelRegistryRepository");
const { ensureDirectory } = require("../utils/fileStorage");
const { HttpError } = require("../utils/httpError");
const { readFeatureCollection } = require("../repositories/geoJsonRepository");

const SUPPORTED_MODEL_EXTENSIONS = new Set([".glb", ".gltf"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeModelId(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName));
  return `model-${sanitizeNamePart(baseName)}-${Date.now()}`;
}

function sanitizeNamePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "model";
}

function toSafeModelFileName(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = sanitizeNamePart(path.basename(fileName, extension));
  return `${baseName}${extension}`;
}

function getModelType(fileName) {
  const extension = path.extname(fileName).toLowerCase().replace(".", "");
  return extension || "glb";
}

function normalizeBase64(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "Model upload requires contentBase64.");
  }

  return value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
}

async function discoverExistingModelFiles(registeredModels) {
  await ensureDirectory(modelsDir);

  const registeredUrls = new Set(registeredModels.map((model) => model.url));
  const entries = await readdir(modelsDir, { withFileTypes: true });
  const discovered = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();

    if (!SUPPORTED_MODEL_EXTENSIONS.has(extension)) continue;

    const url = `/models/${entry.name}`;

    if (registeredUrls.has(url)) continue;

    const info = await stat(path.join(modelsDir, entry.name));
    discovered.push({
      id: `model-existing-${sanitizeNamePart(path.basename(entry.name, extension))}`,
      name: path.basename(entry.name, extension).replace(/[-_]+/g, " "),
      originalFileName: entry.name,
      url,
      type: extension.replace(".", ""),
      uploadedAt: info.mtime.toISOString(),
      metadata: {
        source: "existing-public-model",
      },
    });
  }

  return discovered;
}

async function listModels() {
  const registeredModels = await readModelRegistry();
  const discoveredModels = await discoverExistingModelFiles(registeredModels);
  return [...registeredModels, ...discoveredModels];
}

async function getModel(modelId) {
  const model = (await listModels()).find((item) => item.id === modelId);

  if (!model) {
    throw new HttpError(404, "Model was not found.");
  }

  return model;
}

async function uploadModel(payload) {
  const fileName = String(payload?.fileName ?? payload?.originalFileName ?? "");
  const extension = path.extname(fileName).toLowerCase();

  if (!fileName || !SUPPORTED_MODEL_EXTENSIONS.has(extension)) {
    throw new HttpError(400, "Only .glb and .gltf model files are supported.");
  }

  const content = Buffer.from(normalizeBase64(payload.contentBase64), "base64");

  if (content.length === 0) {
    throw new HttpError(400, "Uploaded model is empty.");
  }

  await ensureDirectory(modelsDir);

  const safeFileName = `${Date.now()}-${toSafeModelFileName(fileName)}`;
  const modelId = makeModelId(fileName);
  const model = {
    id: modelId,
    name: String(payload.name ?? path.basename(fileName, extension)),
    originalFileName: fileName,
    url: `/models/${safeFileName}`,
    type: getModelType(fileName),
    uploadedAt: new Date().toISOString(),
    metadata: isRecord(payload.metadata)
      ? payload.metadata
      : {
          source: "user-upload",
        },
  };

  await writeFile(path.join(modelsDir, safeFileName), content);

  const registry = await readModelRegistry();
  await writeModelRegistry([...registry, model]);

  return model;
}

async function updateModel(modelId, patch) {
  const registry = await readModelRegistry();
  const index = registry.findIndex((model) => model.id === modelId);

  if (index < 0) {
    const discoveredModel = (await listModels()).find(
      (model) => model.id === modelId,
    );

    if (!discoveredModel) {
      throw new HttpError(404, "Model was not found in registry.");
    }

    const nextModel = {
      ...discoveredModel,
      ...patch,
      id: discoveredModel.id,
    };

    await writeModelRegistry([...registry, nextModel]);
    return nextModel;
  }

  const nextRegistry = [...registry];
  nextRegistry[index] = {
    ...nextRegistry[index],
    ...patch,
    id: nextRegistry[index].id,
  };

  await writeModelRegistry(nextRegistry);
  return nextRegistry[index];
}

async function isModelUsed(model) {
  const collection = await readFeatureCollection(independentEntitiesFile);

  return collection.features.some((feature) => {
    const properties = isRecord(feature.properties) ? feature.properties : {};
    return properties.modelId === model.id || properties.modelUrl === model.url;
  });
}

async function deleteModel(modelId) {
  const registry = await readModelRegistry();
  const model = registry.find((item) => item.id === modelId);

  if (!model) {
    throw new HttpError(404, "Model was not found in registry.");
  }

  if (await isModelUsed(model)) {
    throw new HttpError(409, "Model is used by an entity and cannot be deleted.");
  }

  const relativePath = model.url.startsWith("/models/")
    ? model.url.slice("/models/".length)
    : "";
  const filePath = path.resolve(modelsDir, relativePath);

  if (filePath.startsWith(path.resolve(modelsDir))) {
    await rm(filePath, { force: true });
  }

  await writeModelRegistry(registry.filter((item) => item.id !== modelId));
  return {
    id: modelId,
  };
}

function resolveModelFilePath(model) {
  if (!model.url.startsWith("/models/")) {
    throw new HttpError(400, "Model URL must point to /models.");
  }

  const filePath = path.resolve(modelsDir, model.url.slice("/models/".length));
  const rootPath = path.resolve(modelsDir);

  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
    throw new HttpError(400, "Model path is outside the models directory.");
  }

  return filePath;
}

async function readModelFile(model) {
  return readFile(resolveModelFilePath(model));
}

module.exports = {
  deleteModel,
  getModel,
  listModels,
  readModelFile,
  resolveModelFilePath,
  updateModel,
  uploadModel,
};
