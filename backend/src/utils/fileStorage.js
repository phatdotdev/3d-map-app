const { mkdir, readFile, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");

const { HttpError } = require("./httpError");

function isNodeError(error) {
  return error instanceof Error && typeof error.code === "string";
}

async function ensureDirectory(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function readJsonFile(filePath, fallbackFactory) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT" && fallbackFactory) {
      return fallbackFactory();
    }

    if (error instanceof SyntaxError) {
      throw new HttpError(500, `Invalid JSON file: ${path.basename(filePath)}.`);
    }

    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await ensureDirectory(path.dirname(filePath));

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(value, null, 2)}\n`;

  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

module.exports = {
  ensureDirectory,
  readJsonFile,
  writeJsonAtomic,
};

