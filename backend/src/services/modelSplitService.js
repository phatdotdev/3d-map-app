const { readFile } = require("node:fs/promises");
const path = require("node:path");

const { modelsDir } = require("../config/paths");
const { ensureDirectory, writeJsonAtomic } = require("../utils/fileStorage");
const { HttpError } = require("../utils/httpError");
const { splitGlbByNode } = require("../utils/gltf/glbNodeSplitter");
const modelRegistryService = require("./modelRegistryService");

async function readManifest(modelId) {
  const manifestPath = path.join(modelsDir, "split", modelId, "manifest.json");
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

async function splitModel(modelId, payload = {}) {
  const strategy = payload.strategy ?? "by-node";
  const force = payload.force === true;

  if (strategy !== "by-node") {
    throw new HttpError(400, "Only split strategy by-node is supported.");
  }

  const model = await modelRegistryService.getModel(modelId);

  if (!force && model.split?.enabled && model.split?.manifestUrl) {
    const manifest = await readManifest(modelId);
    return {
      modelId,
      parentModelUrl: model.url,
      parent: manifest.parent,
      manifestUrl: model.split.manifestUrl,
      parts: manifest.parts ?? [],
      alreadySplit: true,
    };
  }

  if (path.extname(model.originalFileName || model.url).toLowerCase() !== ".glb") {
    throw new HttpError(422, "Only GLB files can be split by node in this demo.");
  }

  const sourceBuffer = await modelRegistryService.readModelFile(model);
  const outputDir = path.join(modelsDir, "split", modelId);
  const manifestUrl = `/models/split/${modelId}/manifest.json`;

  await ensureDirectory(outputDir);

  const manifest = await splitGlbByNode({
    modelId,
    sourceBuffer,
    outputDir,
    parentUrl: model.url,
    publicUrlBase: `/models/split/${modelId}`,
  });

  await writeJsonAtomic(path.join(outputDir, "manifest.json"), manifest);
  await modelRegistryService.updateModel(modelId, {
    split: {
      enabled: true,
      manifestUrl,
    },
  });

  return {
    modelId,
    parentModelUrl: model.url,
    parent: manifest.parent,
    manifestUrl,
    parts: manifest.parts,
    regenerated: force,
  };
}

async function getModelParts(modelId) {
  const model = await modelRegistryService.getModel(modelId);

  if (!model.split?.enabled || !model.split?.manifestUrl) {
    return {
      modelId,
      parentModelUrl: model.url,
      manifestUrl: null,
      parts: [],
    };
  }

  const manifest = await readManifest(modelId);

  return {
    modelId,
    parentModelUrl: model.url,
    parent: manifest.parent,
    manifestUrl: model.split.manifestUrl,
    parts: manifest.parts ?? [],
  };
}

module.exports = {
  getModelParts,
  splitModel,
};
