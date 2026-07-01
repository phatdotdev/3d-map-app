const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..", "..");
const dataDir = path.join(backendRoot, "data");
const rawDataDir = path.join(dataDir, "raw");
const rawUploadDir = path.join(rawDataDir, "uploads");
const publicDir = path.join(backendRoot, "public");
const modelsDir = path.join(publicDir, "models");
const layerDataFile = path.join(dataDir, "layer-data.json");
const independentEntitiesFile = path.join(dataDir, "independent-entities.geojson");
const modelRegistryFile = path.join(dataDir, "model-registry.json");
const appRoot = path.resolve(backendRoot, "..");
const frontendPublicDir = path.join(appRoot, "frontend", "public");

module.exports = {
  appRoot,
  backendRoot,
  dataDir,
  frontendPublicDir,
  independentEntitiesFile,
  layerDataFile,
  modelRegistryFile,
  modelsDir,
  publicDir,
  rawDataDir,
  rawUploadDir,
};
