const spatialLayerService = require("../services/spatialLayerService");

async function getSpatialLayers(_req, res, next) {
  try {
    res.json(await spatialLayerService.listLayers());
  } catch (error) {
    next(error);
  }
}

async function createSpatialLayer(req, res, next) {
  try {
    res.status(201).json(await spatialLayerService.createLayer(req.body));
  } catch (error) {
    next(error);
  }
}

async function updateSpatialLayer(req, res, next) {
  try {
    res.json(
      await spatialLayerService.updateLayer(
        decodeURIComponent(req.params.layerId),
        req.body,
      ),
    );
  } catch (error) {
    next(error);
  }
}

async function updateSpatialLayerFeatureGeometry(req, res, next) {
  try {
    res.json(
      await spatialLayerService.updateLayerFeatureGeometry(
        decodeURIComponent(req.params.layerId),
        decodeURIComponent(req.params.featureId),
        req.body,
      ),
    );
  } catch (error) {
    next(error);
  }
}

async function deleteSpatialLayer(req, res, next) {
  try {
    res.json(
      await spatialLayerService.deleteLayer(
        decodeURIComponent(req.params.layerId),
      ),
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createSpatialLayer,
  deleteSpatialLayer,
  getSpatialLayers,
  updateSpatialLayer,
  updateSpatialLayerFeatureGeometry,
};
