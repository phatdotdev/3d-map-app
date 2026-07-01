const { writeFile } = require("node:fs/promises");
const path = require("node:path");

const { NodeIO } = require("@gltf-transform/core");
const { cloneDocument, getBounds, prune } = require("@gltf-transform/functions");

const { ensureDirectory } = require("../fileStorage");
const { HttpError } = require("../httpError");

function sanitizePartName(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;
}

function makeUniquePartId(baseId, usedIds) {
  let partId = baseId;
  let counter = 2;

  while (usedIds.has(partId)) {
    partId = `${baseId}-${counter}`;
    counter += 1;
  }

  usedIds.add(partId);
  return partId;
}

function getNodeName(node, index) {
  return String(node.getName() || `node-${index + 1}`);
}

function toBoundsMetadata(bounds) {
  if (!bounds?.min || !bounds?.max) {
    return null;
  }

  const size = bounds.max.map((value, index) => value - bounds.min[index]);

  return {
    min: bounds.min,
    max: bounds.max,
    size,
  };
}

function getDefaultScene(document) {
  const root = document.getRoot();
  return root.getDefaultScene() ?? root.listScenes()[0] ?? null;
}

function getSplitCandidates(document) {
  const nodes = document.getRoot().listNodes();

  return nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.getMesh() !== null);
}

function getNodePath(node) {
  const pathToNode = [];

  for (let current = node; current; current = current.getParentNode()) {
    pathToNode.unshift(current);
  }

  return pathToNode;
}

function keepOnlyNodePath(document, nodeIndex) {
  const root = document.getRoot();
  const scenes = root.listScenes();
  const nodes = root.listNodes();
  const targetNode = nodes[nodeIndex];

  if (!targetNode) {
    throw new HttpError(500, "Unable to find cloned split node.");
  }

  const nodePath = getNodePath(targetNode);
  const scene = getDefaultScene(document) ?? document.createScene();

  for (const currentScene of scenes) {
    for (const child of [...currentScene.listChildren()]) {
      currentScene.removeChild(child);
    }
  }

  scene.addChild(nodePath[0]);
  root.setDefaultScene(scene);

  for (let index = 0; index < nodePath.length - 1; index += 1) {
    const currentNode = nodePath[index];
    const nextNode = nodePath[index + 1];

    for (const child of [...currentNode.listChildren()]) {
      if (child !== nextNode) {
        currentNode.removeChild(child);
      }
    }
  }
}

async function createPartDocument(sourceDocument, nodeIndex) {
  const partDocument = cloneDocument(sourceDocument);
  const asset = partDocument.getRoot().getAsset();

  asset.generator = "ArcGIS-3D-WEB GLB node splitter";
  keepOnlyNodePath(partDocument, nodeIndex);
  await partDocument.transform(prune());

  return partDocument;
}

async function splitGlbByNode({
  modelId,
  sourceBuffer,
  outputDir,
  parentUrl,
  publicUrlBase,
}) {
  const io = new NodeIO();
  let sourceDocument;

  try {
    sourceDocument = await io.readBinary(new Uint8Array(sourceBuffer));
  } catch (error) {
    throw new HttpError(
      400,
      `Model is not a readable GLB file: ${error.message}`,
    );
  }

  const candidates = getSplitCandidates(sourceDocument);

  if (candidates.length <= 1) {
    throw new HttpError(
      422,
      "Model does not have multiple node/mesh components to split. Use a component-structured GLB or a Blender/boolean workflow for complex cuts.",
    );
  }

  await ensureDirectory(outputDir);

  const usedIds = new Set();
  const parts = [];
  const sourceScene = getDefaultScene(sourceDocument);
  const modelBounds = sourceScene ? toBoundsMetadata(getBounds(sourceScene)) : null;

  for (const { node, index } of candidates) {
    const name = getNodeName(node, index);
    const partId = makeUniquePartId(
      `part-${sanitizePartName(name, `node-${index + 1}`)}`,
      usedIds,
    );
    const fileName = `${partId}.glb`;
    const partDocument = await createPartDocument(sourceDocument, index);
    const partScene = getDefaultScene(partDocument);
    const partBounds = partScene ? toBoundsMetadata(getBounds(partScene)) : null;

    await writeFile(
      path.join(outputDir, fileName),
      Buffer.from(await io.writeBinary(partDocument)),
    );

    parts.push({
      id: partId,
      name,
      url: `${publicUrlBase}/${fileName}`,
      sourceNodeName: name,
      sourceNodeIndex: index,
      visible: true,
      metadata: {
        bounds: partBounds,
      },
    });
  }

  return {
    modelId,
    strategy: "by-node",
    createdAt: new Date().toISOString(),
    parent: {
      url: parentUrl,
      bounds: modelBounds,
    },
    parts,
  };
}

module.exports = {
  splitGlbByNode,
};
