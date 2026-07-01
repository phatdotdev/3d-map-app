const independentEntityService = require("../services/independentEntityService");

async function getIndependentEntities(req, res, next) {
  try {
    res.json(await independentEntityService.listIndependentEntities(req.query));
  } catch (error) {
    next(error);
  }
}

async function createIndependentEntity(req, res, next) {
  try {
    res.status(201).json(
      await independentEntityService.createIndependentEntity(req.body),
    );
  } catch (error) {
    next(error);
  }
}

async function getIndependentEntity(req, res, next) {
  try {
    res.json(
      await independentEntityService.getIndependentEntity(
        decodeURIComponent(req.params.entityId),
      ),
    );
  } catch (error) {
    next(error);
  }
}

async function updateIndependentEntity(req, res, next) {
  try {
    res.json(
      await independentEntityService.updateIndependentEntity(
        decodeURIComponent(req.params.entityId),
        req.body,
      ),
    );
  } catch (error) {
    next(error);
  }
}

async function deleteIndependentEntity(req, res, next) {
  try {
    res.json(
      await independentEntityService.deleteIndependentEntity(
        decodeURIComponent(req.params.entityId),
      ),
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createIndependentEntity,
  deleteIndependentEntity,
  getIndependentEntity,
  getIndependentEntities,
  updateIndependentEntity,
};
