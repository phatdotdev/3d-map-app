const webAssetExportService = require("../services/webAssetExportService");

async function exportWebAssets(_req, res, next) {
  try {
    res.json(await webAssetExportService.exportWebAssets());
  } catch (error) {
    next(error);
  }
}

module.exports = {
  exportWebAssets,
};

