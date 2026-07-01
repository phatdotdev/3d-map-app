const { copyFile, mkdir, readdir, readFile, rm, stat } = require("node:fs/promises");
const path = require("node:path");

const {
  frontendPublicDir,
  independentEntitiesFile,
  modelsDir,
  rawDataDir,
} = require("../config/paths");
const { readFeatureCollection } = require("../repositories/geoJsonRepository");
const { readLayerDocument } = require("../repositories/layerFileRepository");
const { ensureDirectory, writeJsonAtomic } = require("../utils/fileStorage");
const { getGeometryBbox } = require("../utils/bbox");
const { HttpError } = require("../utils/httpError");
const modelRegistryService = require("./modelRegistryService");

const TILE_ZOOM = 10;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertInside(parent, target) {
  const rootPath = path.resolve(parent);
  const targetPath = path.resolve(target);

  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new HttpError(500, "Resolved export path is outside expected root.");
  }

  return targetPath;
}

function lonLatToTile(longitude, latitude, zoom = TILE_ZOOM) {
  const latRadians = (Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI) / 180;
  const tiles = 2 ** zoom;

  return {
    z: zoom,
    x: Math.floor(((longitude + 180) / 360) * tiles),
    y: Math.floor(
      ((1 - Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) / 2) * tiles,
    ),
  };
}

function tileToBbox({ x, y, z }) {
  const tiles = 2 ** z;
  const lon1 = (x / tiles) * 360 - 180;
  const lon2 = ((x + 1) / tiles) * 360 - 180;
  const lat1Rad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / tiles)));
  const lat2Rad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / tiles)));

  return [
    lon1,
    (lat1Rad * 180) / Math.PI,
    lon2,
    (lat2Rad * 180) / Math.PI,
  ];
}

function tileId(tile) {
  return `tile-z${tile.z}-x${tile.x}-y${tile.y}`;
}

function getFeatureCenter(feature) {
  const geometry = isRecord(feature.geometry) ? feature.geometry : null;

  if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) {
    return {
      longitude: Number(geometry.coordinates[0] ?? 0),
      latitude: Number(geometry.coordinates[1] ?? 0),
    };
  }

  const bbox = getGeometryBbox(geometry);

  if (!bbox) {
    return {
      longitude: 0,
      latitude: 0,
    };
  }

  return {
    longitude: (bbox.xmin + bbox.xmax) / 2,
    latitude: (bbox.ymin + bbox.ymax) / 2,
  };
}

function resolveLayerSourceFile(sourcePath) {
  const rawPrefix = "/raw/";
  const dataRawPrefix = "/data/raw/";
  const relativePath = sourcePath?.startsWith(dataRawPrefix)
    ? sourcePath.slice(dataRawPrefix.length)
    : sourcePath?.startsWith(rawPrefix)
      ? sourcePath.slice(rawPrefix.length)
      : null;

  if (!relativePath) {
    throw new HttpError(400, `Layer sourcePath ${sourcePath} is not raw GeoJSON.`);
  }

  return assertInside(rawDataDir, path.join(rawDataDir, decodeURIComponent(relativePath)));
}

async function readGeoJsonFile(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));

  if (!isRecord(parsed) || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new HttpError(500, `${path.basename(filePath)} must be a FeatureCollection.`);
  }

  return {
    type: "FeatureCollection",
    features: parsed.features.filter(isRecord),
  };
}

async function writeChunkedCollection({
  collection,
  outputDir,
  publicChunkBaseUrl,
  indexPatch = {},
}) {
  const chunksDir = path.join(outputDir, "chunks");
  const groups = new Map();

  await ensureDirectory(chunksDir);

  for (const feature of collection.features) {
    const center = getFeatureCenter(feature);
    const tile = lonLatToTile(center.longitude, center.latitude);
    const id = tileId(tile);
    const current = groups.get(id) ?? {
      tile,
      features: [],
    };

    current.features.push(feature);
    groups.set(id, current);
  }

  const tiles = [];

  for (const [id, group] of groups) {
    const fileName = `${id}.geojson`;
    const url = `${publicChunkBaseUrl}/${fileName}`;

    await writeJsonAtomic(path.join(chunksDir, fileName), {
      type: "FeatureCollection",
      features: group.features,
    });

    tiles.push({
      id,
      bbox: tileToBbox(group.tile),
      featureCount: group.features.length,
      url,
    });
  }

  const index = {
    ...indexPatch,
    totalFeatures: collection.features.length,
    chunkStrategy: "tile",
    tileZoom: TILE_ZOOM,
    tiles: tiles.sort((left, right) => left.id.localeCompare(right.id)),
  };

  await writeJsonAtomic(path.join(outputDir, "index.json"), index);
  return index;
}

async function copyDirectory(sourceDir, targetDir) {
  await ensureDirectory(targetDir);

  try {
    const entries = await readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(sourcePath, targetPath);
      } else if (entry.isFile()) {
        await copyFile(sourcePath, targetPath);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function exportWebAssets() {
  const publicRoot = path.resolve(frontendPublicDir);
  const dataOutDir = assertInside(publicRoot, path.join(publicRoot, "data"));
  const modelsOutDir = assertInside(publicRoot, path.join(publicRoot, "models"));
  const generatedAt = new Date().toISOString();

  await rm(dataOutDir, { recursive: true, force: true });
  await rm(modelsOutDir, { recursive: true, force: true });
  await mkdir(dataOutDir, { recursive: true });

  const layerDocument = await readLayerDocument();
  const independentCollection = await readFeatureCollection(independentEntitiesFile);

  const independentIndex = await writeChunkedCollection({
    collection: independentCollection,
    outputDir: path.join(dataOutDir, "independent-entities"),
    publicChunkBaseUrl: "/data/independent-entities/chunks",
    indexPatch: {
      layerId: "independent-entities",
      name: "Independent entities",
    },
  });

  const layers = [];

  for (const layer of layerDocument.layers) {
    const sourceFile = resolveLayerSourceFile(layer.sourcePath);
    const collection = await readGeoJsonFile(sourceFile);
    const layerOutputDir = path.join(dataOutDir, "layer-entities", layer.id);
    const index = await writeChunkedCollection({
      collection,
      outputDir: layerOutputDir,
      publicChunkBaseUrl: `/data/layer-entities/${layer.id}/chunks`,
      indexPatch: {
        layerId: layer.id,
        name: layer.name,
      },
    });

    layers.push({
      ...layer,
      sourcePath: `/data/layer-entities/${layer.id}/index.json`,
      chunkIndex: `/data/layer-entities/${layer.id}/index.json`,
      totalFeatures: index.totalFeatures,
    });
  }

  await writeJsonAtomic(path.join(dataOutDir, "layers.json"), {
    version: layerDocument.version ?? "1.0.0",
    generatedAt,
    layers,
  });

  await ensureDirectory(path.join(dataOutDir, "models"));
  await copyDirectory(modelsDir, modelsOutDir);

  const modelRegistry = await modelRegistryService.listModels();
  await writeJsonAtomic(path.join(dataOutDir, "models", "model-registry.json"), modelRegistry);

  const catalog = {
    version: "1.0.0",
    generatedAt,
    layers: "/data/layers.json",
    independentEntities: {
      index: "/data/independent-entities/index.json",
      totalFeatures: independentIndex.totalFeatures,
    },
    modelRegistry: "/data/models/model-registry.json",
  };

  await writeJsonAtomic(path.join(dataOutDir, "catalog.json"), catalog);

  const modelsInfo = await stat(modelsOutDir).catch(() => null);

  return {
    catalog,
    outputDir: dataOutDir,
    modelOutputDir: modelsOutDir,
    layerCount: layers.length,
    independentFeatureCount: independentIndex.totalFeatures,
    modelCount: modelRegistry.length,
    modelsCopied: Boolean(modelsInfo),
  };
}

module.exports = {
  exportWebAssets,
};

