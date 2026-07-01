const modelRegistryService = require("../services/modelRegistryService");
const modelSplitService = require("../services/modelSplitService");

async function getModels(_req, res, next) {
  try {
    res.json({
      models: await modelRegistryService.listModels(),
    });
  } catch (error) {
    next(error);
  }
}

async function uploadModel(req, res, next) {
  try {
    res.status(201).json({
      model: await modelRegistryService.uploadModel(req.body),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteModel(req, res, next) {
  try {
    res.json(
      await modelRegistryService.deleteModel(
        decodeURIComponent(req.params.modelId),
      ),
    );
  } catch (error) {
    next(error);
  }
}

async function splitModel(req, res, next) {
  try {
    res.json(
      await modelSplitService.splitModel(
        decodeURIComponent(req.params.modelId),
        req.body,
      ),
    );
  } catch (error) {
    next(error);
  }
}

async function getModelParts(req, res, next) {
  try {
    res.json(
      await modelSplitService.getModelParts(
        decodeURIComponent(req.params.modelId),
      ),
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  deleteModel,
  getModelParts,
  getModels,
  splitModel,
  uploadModel,
};

