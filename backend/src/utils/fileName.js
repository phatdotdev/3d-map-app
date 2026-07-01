const path = require("node:path");

function toSafeFileName(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const safeExtension = extension === ".json" || extension === ".geojson"
    ? extension
    : ".geojson";
  const baseName = path
    .basename(fileName, extension)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${Date.now()}-${baseName || "layer"}${safeExtension}`;
}

module.exports = {
  toSafeFileName,
};

